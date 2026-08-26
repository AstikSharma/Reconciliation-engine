import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const MOCK_DIR = path.join(process.cwd(), 'mock_data');
const ROW_COUNT_PER_FILE = 5000;

function generateLargeMockCSVFiles(rowCount) {
  if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR);
  console.log(`[Benchmark Setup] Generating ${rowCount.toLocaleString()} rows per file (10,000 total rows)...`);

  const userRows = ['id,timestamp,asset,type,quantity'];
  const exchangeRows = ['tx_id,timestamp,asset,type,amount'];
  const assets = ['BTC', 'ETH', 'SOL', 'USDC'];
  const userTypes = ['TRANSFER_OUT', 'BUY', 'TRANSFER_IN', 'SELL'];
  const exchangeTypes = ['TRANSFER_IN', 'BUY', 'TRANSFER_IN', 'SELL'];

  for (let i = 0; i < rowCount; i++) {
    const txId = `tx_${i}`;
    const timestamp = new Date(Date.now() - i * 1000).toISOString();
    const asset = assets[i % assets.length];
    const qty = (1.5 + i * 0.001).toFixed(5);

    userRows.push(`${txId},${timestamp},${asset},${userTypes[i % userTypes.length]},${qty}`);

    const variance = (i % 10 === 0) ? 0.05 : 0.00;
    const exchangeQty = ((1.5 + i * 0.001) + variance).toFixed(5);
    exchangeRows.push(`${txId},${timestamp},${asset},${exchangeTypes[i % exchangeTypes.length]},${exchangeQty}`);
  }

  fs.writeFileSync(path.join(MOCK_DIR, 'user_transactions.csv'), userRows.join('\n'));
  fs.writeFileSync(path.join(MOCK_DIR, 'exchange_transactions.csv'), exchangeRows.join('\n'));
  console.log('[Benchmark Setup] Mock dataset written successfully.');
}

async function runBenchmark() {
  generateLargeMockCSVFiles(ROW_COUNT_PER_FILE);

  console.log('\n[Benchmark] Dispatched 10,000 records to POST /api/reconcile...');

  const form = new FormData();
  form.append('user_file', fs.createReadStream(path.join(MOCK_DIR, 'user_transactions.csv')));
  form.append('exchange_file', fs.createReadStream(path.join(MOCK_DIR, 'exchange_transactions.csv')));
  form.append('timestampToleranceSeconds', '300');
  form.append('quantityTolerancePct', '0.01');

  const baselineHeapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  let maxHeapObservedBytes = process.memoryUsage().heapUsed;

  const memoryMonitor = setInterval(() => {
    const currentHeap = process.memoryUsage().heapUsed;
    if (currentHeap > maxHeapObservedBytes) maxHeapObservedBytes = currentHeap;
  }, 20);

  const startTime = process.hrtime.bigint();

  try {
    const response = await axios.post(`${API_URL}/reconcile`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const endTime = process.hrtime.bigint();
    clearInterval(memoryMonitor);

    const totalSeconds = Number(endTime - startTime) / 1000000000;
    const jobId = response.data.jobId;

    const t0_summary = process.hrtime.bigint();
    await axios.get(`${API_URL}/report/${jobId}/summary`);
    const summaryLatencyMS = Number(process.hrtime.bigint() - t0_summary) / 1000000;

    const t0_unmatched = process.hrtime.bigint();
    await axios.get(`${API_URL}/report/${jobId}/unmatched`);
    const unmatchedLatencyMS = Number(process.hrtime.bigint() - t0_unmatched) / 1000000;

    const totalRows = ROW_COUNT_PER_FILE * 2;
    const peakHeapMB = (maxHeapObservedBytes / 1024 / 1024).toFixed(2);
    const netMemoryShiftMB = (peakHeapMB - baselineHeapMB).toFixed(2);
    const rowsPerSecond = (totalRows / totalSeconds).toFixed(0);

    console.log('\n=================== YOUR REAL SYSTEM METRICS ===================');
    console.log(`• Total Rows Evaluated:         ${totalRows.toLocaleString()} rows`);
    console.log(`• Execution Duration:           ${totalSeconds.toFixed(3)} seconds`);
    console.log(`• Processing Velocity:          ${rowsPerSecond} rows/sec`);
    console.log(`• Net Heap Memory Growth:       ${netMemoryShiftMB} MB (Baseline: ${baselineHeapMB} MB -> Peak: ${peakHeapMB} MB)`);
    console.log(`• Summary Endpoint Latency:      ${summaryLatencyMS.toFixed(2)} ms`);
    console.log(`• Unmatched Query Latency:      ${unmatchedLatencyMS.toFixed(2)} ms`);
    console.log('================================================================');

  } catch (error) {
    clearInterval(memoryMonitor);
    console.error('[Benchmark Failure]:', error.response?.data || error.message);
  } finally {
    fs.rmSync(MOCK_DIR, { recursive: true, force: true });
  }
}

runBenchmark();
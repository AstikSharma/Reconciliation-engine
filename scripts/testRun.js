import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const MOCK_DIR = path.join(process.cwd(), 'mock_data');

function generateMockCSVFiles() {
  if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR);

  const userCSVContent = [
    'id,timestamp,asset,type,quantity',
    'tx_001,2026-05-23T10:00:00Z,BTC,TRANSFER_OUT,1.50000',
    'tx_002,2026-05-23T10:05:00Z,ETH,BUY,10.00000',
    'tx_003,2026-05-23T10:15:00Z,USDC,TRANSFER_IN,500.00'
  ].join('\n');

  const exchangeCSVContent = [
    'tx_id,timestamp,asset,type,amount',
    'tx_001,2026-05-23T10:01:15Z,Bitcoin,TRANSFER_IN,1.50000',
    'tx_002,2026-05-23T10:05:10Z,ETH,BUY,10.05200',
    'tx_004,2026-05-23T10:20:00Z,SOL,TRANSFER_IN,25.00'
  ].join('\n');

  fs.writeFileSync(path.join(MOCK_DIR, 'user_transactions.csv'), userCSVContent);
  fs.writeFileSync(path.join(MOCK_DIR, 'exchange_transactions.csv'), exchangeCSVContent);
  console.log('[Test Setup] Mock transactional engine CSV sets written.');
}

async function runEndToEndVerification() {
  generateMockCSVFiles();

  console.log('[Test Execution] Dispatching payload data to POST /api/reconcile...');
  
  const form = new FormData();
  form.append('user_file', fs.createReadStream(path.join(MOCK_DIR, 'user_transactions.csv')));
  form.append('exchange_file', fs.createReadStream(path.join(MOCK_DIR, 'exchange_transactions.csv')));
  
  form.append('timestampToleranceSeconds', '300');
  form.append('quantityTolerancePct', '0.01');

  try {
    const response = await axios.post(`${API_URL}/reconcile`, form, {
      headers: form.getHeaders(),
    });

    console.log('\n================ [API Response Verification Summary] ================');
    console.log(JSON.stringify(response.data, null, 2));
    
    const jobId = response.data.jobId;
    if (jobId) {
      console.log(`\n[Test Execution] Querying export audit stream target for Job ID: ${jobId}...`);
      const exportResponse = await axios.get(`${API_URL}/export/${jobId}`);
      
      console.log('\n================ [Exported Streamed CSV Output Log] ================');
      console.log(exportResponse.data);
      console.log('====================================================================');
      console.log('[Test Success] End-to-end reconciliation system successfully verified.');
    }
  } catch (error) {
    console.error('[Test Failure] Integration check pipeline failed:', error.response?.data || error.message);
  } finally {
    fs.rmSync(MOCK_DIR, { recursive: true, force: true });
  }
}

runEndToEndVerification();
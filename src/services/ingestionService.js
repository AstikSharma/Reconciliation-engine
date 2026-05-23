import fs from 'fs';
import { parse } from 'csv-parse';
import { RawTransaction } from '../models/RawTransaction.js';
import { validateAndNormalizeRow } from '../utils/validator.js';

/**
 * Streams a CSV file from a system path, validates rows sequentially, and drops them into MongoDB.
 * @param {string} filePath
 * @param {string} source
 * @param {string} jobId
 * @returns {Promise<Object>}
 */
export const ingestTransactionCSV = async (filePath, source, jobId) => {
  return new Promise((resolve, reject) => {
    let totalRows = 0;
    let malformedRows = 0;
    const batchSize = 500;
    let writeBuffer = [];

    const fileStream = fs.createReadStream(filePath);

    const csvParser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const flushBuffer = async () => {
      if (writeBuffer.length === 0) return;
      const documentsToInsert = [...writeBuffer];
      writeBuffer = [];
      await RawTransaction.insertMany(documentsToInsert, { ordered: false });
    };

    fileStream.pipe(csvParser)
      .on('data', async (rawRow) => {
        totalRows++;
        const validation = validateAndNormalizeRow(rawRow);
        if (validation.status === 'malformed' && totalRows <= 1) {
          console.log(`\n=================== [DEBUG: ${source.toUpperCase()} ROW 1] ===================`);
          console.log('Parsed Object Keys from CSV:', Object.keys(rawRow));
          console.log('Raw Values:', JSON.stringify(rawRow));
          console.log('Validation Rejection Reasons:', validation.errors);
          console.log('==================================================================\n');
        }
        const dbDocument = {
          source,
          status: validation.status,
          validationErrors: validation.errors,
          rawData: rawRow,
          jobId,
          ...(validation.status === 'valid' ? validation.normalized : {})
        };
        if (validation.status === 'malformed') {
          malformedRows++;
        }
        writeBuffer.push(dbDocument);
        if (writeBuffer.length >= batchSize) {
          csvParser.pause();
          try {
            await flushBuffer();
          } catch (err) {
            console.error(`[Ingestion] Batch save anomaly encountered on source ${source}:`, err.message);
          }
          csvParser.resume();
        }
      })
      .on('end', async () => {
        try {
          await flushBuffer();
          console.log(`[Ingestion] Completed processing for ${source}. Handled: ${totalRows} rows total.`);
          resolve({
            totalRows,
            malformedRows
          });
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (error) => {
        console.error(`[Ingestion] System streaming disruption encountered:`, error.message);
        reject(error);
      });
  });
};
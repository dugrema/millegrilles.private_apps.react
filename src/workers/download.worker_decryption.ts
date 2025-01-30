import { expose } from 'comlink';
import { DownloadDecryptionWorker } from './download.decryption';

// Expose dedicated worker
var worker = new DownloadDecryptionWorker();
expose(worker);

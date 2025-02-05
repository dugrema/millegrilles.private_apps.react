import { expose } from 'comlink';
import { UploadEncryptionWorker } from './upload.encryption';

// Expose dedicated worker
var worker = new UploadEncryptionWorker();
expose(worker);

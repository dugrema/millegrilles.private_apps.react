import { expose } from 'comlink';
import { UploadThreadWorker } from './upload.thread';

// Expose dedicated worker
var worker = new UploadThreadWorker();
expose(worker);

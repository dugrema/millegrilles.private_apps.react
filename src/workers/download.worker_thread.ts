import { expose } from 'comlink';
import { DownloadThreadWorker } from './download.thread';

// Expose dedicated worker
var worker = new DownloadThreadWorker();
expose(worker);

import { expose } from 'comlink';
import {AppsDownloadWorker} from './download.worker';

var worker = new AppsDownloadWorker();
// Expose as a dedicated web worker
expose(worker);

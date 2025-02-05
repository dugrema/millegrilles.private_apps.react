import { expose } from 'comlink';
import {AppsUploadWorker} from './upload.worker';

var worker = new AppsUploadWorker();
// Expose as a dedicated web worker
expose(worker);

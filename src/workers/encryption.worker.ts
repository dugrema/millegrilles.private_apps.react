import { expose } from 'comlink';
import { AppsEncryptionWorker } from './encryption';
var worker = new AppsEncryptionWorker();
expose(worker);

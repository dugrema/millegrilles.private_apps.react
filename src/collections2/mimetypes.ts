import mimetype_video from '../resources/mimetype_video.json';
import ext_mimetype from '../resources/ext_mimetype.json';

export function isVideoMimetype(mimetype: string) {
    if(mimetype.startsWith('video/')) return true;
    return mimetype_video.literal.includes(mimetype);
}

export function getMimetypeByExtensionMap() {
    return ext_mimetype as {[extension: string]: string};
}

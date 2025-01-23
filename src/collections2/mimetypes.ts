import mimetype_video from '../resources/mimetype_video.json'

export function isVideoMimetype(mimetype: string) {
    if(mimetype.startsWith('video/')) return true;
    return mimetype_video.literal.includes(mimetype);
}

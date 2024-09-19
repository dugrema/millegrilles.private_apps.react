import { openDB } from 'idb';
import { keymaster, multiencoding } from 'millegrilles.cryptography';

const CONST_DB_NAME = 'millegrilles';
const CONST_STORE_KEY = 'clesDechiffrees';

export type DecryptionKey = { cle_id: string, cle_secrete_base64: string, signature?: keymaster.DomainSignature | null };

export type DecryptionKeyIdb = { hachage_bytes: string, cleSecrete: Uint8Array };

export async function saveDecryptedKey(keyId: string, secretKey: Uint8Array | string) {
    const db = await openDB(CONST_DB_NAME);
  
    if(typeof(secretKey) === 'string') {
        // Convert from base64 to Uint8Array
        secretKey = multiencoding.decodeBase64(secretKey);
    }

    const data = {
        hachage_bytes: keyId,
        cleSecrete: secretKey,
        date: new Date(),
    };
  
    return db.transaction(CONST_STORE_KEY, 'readwrite')
        .objectStore(CONST_STORE_KEY)
        .put(data);
}
  
export async function getDecryptedKeys(keyIds: Array<string>): Promise<Array<DecryptionKeyIdb>> {
    const db = await openDB(CONST_DB_NAME);
    const store = db
        .transaction(CONST_STORE_KEY, 'readonly')
        .objectStore(CONST_STORE_KEY);
    
    let keys = await Promise.all(keyIds.map(item=>store.get(item)));
    // Remove unknown keys
    keys = keys.filter(item=>item);
    return keys;
}

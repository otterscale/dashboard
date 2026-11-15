// The private key is stashed in IndexedDB until the key is revealed, so a refresh
// while waiting for the operator does not lose it.

// The operator rejects any other modulus length or hash.
const RSA_PARAMS: RsaHashedKeyGenParams = {
	name: 'RSA-OAEP',
	modulusLength: 3072,
	publicExponent: new Uint8Array([1, 0, 1]),
	hash: 'SHA-256'
};

export const PUBLIC_KEY_FORMAT = 'RSA-OAEP-SHA256-SPKI';

export async function generateKeyPair(): Promise<CryptoKeyPair> {
	return crypto.subtle.generateKey(RSA_PARAMS, /* extractable */ false, ['encrypt', 'decrypt']);
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
	const spki = await crypto.subtle.exportKey('spki', publicKey);
	let binary = '';
	for (const byte of new Uint8Array(spki)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export async function decryptApiKey(
	privateKey: CryptoKey,
	encryptedKeyBase64: string
): Promise<string> {
	const bytes = Uint8Array.from(atob(encryptedKeyBase64), (c) => c.charCodeAt(0));
	const plain = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, bytes);
	return new TextDecoder().decode(plain);
}

const DB_NAME = 'otterscale-apikey-reveal';
const STORE = 'private-keys';

export function stashId(
	cluster: string,
	namespace: string,
	name: string,
	generation: number | bigint
): string {
	return `${cluster}/${namespace}/${name}/${generation}`;
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const database = await openDatabase();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(database.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		database.close();
	}
}

// Best effort: private browsing may refuse IndexedDB.
export async function stashPrivateKey(id: string, privateKey: CryptoKey): Promise<void> {
	try {
		await withStore('readwrite', (store) => store.put(privateKey, id));
	} catch (error) {
		console.warn('[api-keys] could not stash private key (refresh will lose it):', error);
	}
}

export async function loadStashedPrivateKey(id: string): Promise<CryptoKey | undefined> {
	try {
		return await withStore<CryptoKey | undefined>('readonly', (store) => store.get(id));
	} catch {
		return undefined;
	}
}

export async function deleteStashedPrivateKey(id: string): Promise<void> {
	try {
		await withStore('readwrite', (store) => store.delete(id));
	} catch {
		// Best effort.
	}
}

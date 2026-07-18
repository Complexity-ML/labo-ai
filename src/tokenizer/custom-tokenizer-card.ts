export interface CustomTokenizerCard {
  id: string
  label: string
  category: string
  pythonCode: string
}

const databaseName = 'labo-ai-tokenizer-cards'
const storeName = 'cards'

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
}

export async function loadTokenizerCards(): Promise<CustomTokenizerCard[]> {
  const database = await openDatabase()
  if (!database) return []
  return new Promise((resolve) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get('user-cards')
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.filter((card): card is CustomTokenizerCard => card && typeof card.id === 'string' && typeof card.label === 'string' && typeof card.pythonCode === 'string') : [])
    request.onerror = () => resolve([])
  })
}

export async function saveTokenizerCards(cards: CustomTokenizerCard[]): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(cards, 'user-cards')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
}

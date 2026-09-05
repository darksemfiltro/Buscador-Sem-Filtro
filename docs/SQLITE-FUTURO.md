# SQLite futuro (fora deste escopo)

O app é 100% estático (`file://`, `npx serve`): **não há SQLite real**
no frontend. As chaves ficam no cofre WebCrypto (`js/vault.js`).

Um SQLite de verdade exigiria um **backend mínimo**:

1. Node + `better-sqlite3` (ou `node:sqlite`) com **SQLCipher**
   para criptografia em repouso.
2. O backend guardaria as chaves; o frontend receberia apenas
   um token de sessão (nunca a key).
3. Migração: exportar o JSON do cofre e importar no banco.

Fora deste escopo: backend, SQLCipher, keychain do SO e OAuth.

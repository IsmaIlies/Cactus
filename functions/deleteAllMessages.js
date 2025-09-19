const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

async function deleteAllMessages() {
  const snapshot = await db.collection("messages").get();
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(`✅ Tous les messages ont été supprimés (${snapshot.size})`);
}

deleteAllMessages().catch(console.error);
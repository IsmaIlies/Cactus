import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { auth } from "../firebase";

export async function uploadProfilePhoto(file: File): Promise<string | null> {
  if (!auth.currentUser) return null;
  const storage = getStorage();
  const storageRef = ref(storage, `profilePhotos/${auth.currentUser.uid}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

export async function updateUserPhotoURL(photoURL: string): Promise<boolean> {
  if (!auth.currentUser) return false;
  const db = getFirestore();
  const userDocRef = doc(db, "users", auth.currentUser.uid);
  await setDoc(userDocRef, { photoURL }, { merge: true });
  return true;
}

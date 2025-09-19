import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { db, storage } from '../firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Emails admin simples (peut être remplacé par custom claims)
const ADMIN_EMAILS = [
  'i.boultame@mars-marketing.fr',
  'm.demauret@mars-marketing.fr'
];

const AdminProgrammePdfUploader: React.FC = () => {
  const user = getAuth().currentUser;
  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || '');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  if (!isAdmin) {
    return <div className="p-6 text-sm text-red-500">Accès refusé</div>;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== 'application/pdf') {
        setStatus('Le fichier doit être un PDF.');
        return;
      }
      setFile(f);
      setStatus('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus('Upload en cours...');
    try {
      // Stockage dans Firebase Storage
      const path = `programme-pdf/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
      const url = await getDownloadURL(storageRef);

      // Métadonnées Firestore (document partagé unique)
      const docRef = doc(db, 'shared', 'programmePdf');
      await setDoc(docRef, {
        name: file.name,
        size: file.size,
        storagePath: path,
        url,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      }, { merge: true });

      setStatus('✅ Upload terminé et publié.');
      setFile(null);
    } catch (e: any) {
      console.error(e);
      setStatus('Erreur upload: ' + (e.message || 'inconnue'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-xl p-6 space-y-4 bg-white rounded-lg shadow border border-gray-200">
      <h1 className="text-lg font-semibold">Programme PDF - Administration</h1>
      <p className="text-sm text-gray-600">Sélectionnez un fichier PDF (il remplacera l'actuel pour tous les agents).</p>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-700"
      />
      {file && (
        <div className="text-xs text-gray-500">Fichier: {file.name} ({Math.round(file.size / 1024)} Ko)</div>
      )}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500"
      >{uploading ? 'Upload...' : 'Publier'}</button>
      {status && <div className="text-xs text-gray-700">{status}</div>}
      <div className="text-[11px] text-gray-500 border-t pt-3">Le document est stocké dans Firebase Storage et référencé dans Firestore (shared/programmePdf). Les agents chargent automatiquement la dernière version.</div>
    </div>
  );
};

export default AdminProgrammePdfUploader;

import React, { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { storage, db, auth } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';

const ProgrammePdfTopBar: React.FC = () => {
  const { user } = useAuth();
  // Allowlist rapide (à migrer vers custom claims plus tard)
  const EMAIL_ALLOWLIST = [
    'j.allione@mars-marketing.fr',
    'i.boultame@mars-marketing.fr',
    'i.brai@mars-marketing.fr'
  ];
  const [name, setName] = useState<string>('Programme PDF');
  const [permError, setPermError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const taskRef = useRef<ReturnType<typeof uploadBytesResumable> | null>(null);
  // Rôles autorisés à changer le PDF
  const privileged = !!user && (
    (user.role && ['admin','superviseur','direction'].includes(user.role.toLowerCase())) ||
    (user.email && EMAIL_ALLOWLIST.includes(user.email.toLowerCase()))
  );

  useEffect(() => {
    // La lecture est publique maintenant, mais on attend user pour connaître le rôle (facultatif)
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'shared', 'programmePdf'));
        if (!active) return;
        if (snap.exists()) {
          const d: any = snap.data();
          if (d?.name) setName(String(d.name));
          if (d?.updatedAt?.toDate) setUpdatedAt(d.updatedAt.toDate());
        }
        setPermError(false);
      } catch (e: any) {
        if (e?.code === 'permission-denied') {
          setPermError(true);
        }
      }
    })();
    return () => { active = false; };
  }, [user]);

  const slugify = (str: string) => str
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^[-.]+|[-.]+$/g,'')
    .toLowerCase();

  const handleUpload = async () => {
    if (!file || uploading || !privileged) return;
    setUploadError(null);
    setProgress(0);
    try {
      setUploading(true);
      setDebugInfo('Préparation upload...');
      // Rafraîchir le token pour éviter un 403 déguisé en CORS si token expiré
      try { await auth.currentUser?.getIdToken(true); } catch(e:any){ console.warn('Refresh token échoué', e); }
      // Ping diagnostic Storage
      try {
        const ping = await fetch(`https://firebasestorage.googleapis.com/v0/b/${storage.app.options.storageBucket}/o?maxResults=1`, { method: 'GET' });
        setDebugInfo(`Ping Storage status: ${ping.status}`);
      } catch (pingErr:any) {
        setDebugInfo(`Ping Storage échec: ${pingErr?.message||pingErr}`);
      }
      const MAX_SIZE_BYTES = 30 * 1024 * 1024; // 30MB
      if (file.size > MAX_SIZE_BYTES) {
        setUploadError('Fichier trop lourd (max 30MB)');
        setUploading(false);
        return;
      }
      // Récupérer l'ancien chemin de stockage avant de publier le nouveau
      let oldPath: string | null = null;
      try {
        const existing = await getDoc(doc(db, 'shared', 'programmePdf'));
        if (existing.exists()) {
          const data: any = existing.data();
            if (data?.storagePath) oldPath = data.storagePath;
        }
      } catch (e) {
        console.warn('Impossible de lire le doc programmePdf avant upload (continuation quand même)', e);
      }
      const cleanName = slugify(file.name);
      const path = `programme-pdf/${Date.now()}-${cleanName}`;
      const storageRef = ref(storage, path);
      let usedFallback = false;
      const task = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' });
      taskRef.current = task;
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', (snap) => {
          if (snap.totalBytes > 0) {
            setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        }, async (err) => {
          const msg = (err?.message||'').toLowerCase();
            // Fallback si erreur réseau/CORS
            if (!usedFallback && (msg.includes('cors') || msg.includes('failed') || msg.includes('network'))) {
              usedFallback = true;
              setDebugInfo(prev => (prev? prev+'\n':'') + 'Resumable échec, tentative fallback uploadBytes...');
              try {
                await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
                setProgress(100);
                resolve();
                return;
              } catch(fbErr:any){
                setDebugInfo(prev => (prev? prev+'\n':'') + 'Fallback échoué: ' + (fbErr?.code||fbErr?.message||fbErr));
              }
            }
            reject(err);
        }, () => resolve());
      });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, 'shared', 'programmePdf'), {
        name: file.name,
        size: file.size,
        storagePath: path,
        url,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || null,
        version: increment(1),
      }, { merge: true });
      // Supprimer l'ancien fichier dans le Storage si différent
      if (oldPath && oldPath !== path) {
        try {
          await deleteObject(ref(storage, oldPath));
          // console.log('Ancien PDF supprimé:', oldPath);
        } catch (delErr: any) {
          // On ignore les erreurs de suppression pour ne pas bloquer la publication
          if (delErr?.code !== 'storage/object-not-found') {
            console.warn('Échec suppression ancien PDF', delErr);
          }
        }
      }
      setFile(null);
      setProgress(100);
      setDebugInfo(prev => (prev? prev+'\n':'') + 'Upload terminé & doc Firestore mis à jour.');
    } catch (e: any) {
      console.error('Upload PDF programme échec', e);
      let msg = 'Upload échoué';
      if (e?.code) msg += ` (${e.code})`;
      if (e?.message) msg += `: ${e.message}`;
      if (e?.code === 'storage/unauthorized' || e?.code === 'permission-denied' || /403/.test(e?.message||'')) {
        msg += '\nPermissions: Ton compte n\'a pas les droits d\'écriture pour le bucket. Assure-toi d\'être connecté et d\'avoir le rôle admin/direction/superviseur ou un email autorisé.';
      }
      if (e?.message?.toLowerCase().includes('cors')) {
        msg += '\nCORS: Configuration bucket (CORS) ou préflight bloqué (OPTIONS). Vérifie origin http://localhost:5173 autorisé.';
      }
      if (e?.message?.includes('network') || e?.message?.includes('Failed to fetch')) {
        msg += '\nRéseau: Auth expirée / proxy / extension / antivirus. Teste autre navigateur ou navigation privée.';
      }
      // Fallback total : si bucket introuvable (404) ou échec CORS, on enregistre le PDF en base64 directement dans Firestore
      const isBucket404 = /404/.test(e?.message || '') || /not found/i.test(e?.message || '') || (debugInfo||'').includes('404');
      const isCors = /cors/i.test(e?.message || '');
      if ((isBucket404 || isCors) && file.size < 2 * 1024 * 1024) { // limiter à 2MB pour Firestore
        try {
          setDebugInfo(prev => (prev? prev+'\n':'') + 'Fallback base64 Firestore (bucket indisponible).');
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => {
              const res = reader.result as string; // data:application/pdf;base64,....
              const pure = res.split(',')[1];
              resolve(pure);
            };
            reader.readAsDataURL(file);
          });
          await setDoc(doc(db, 'shared', 'programmePdf'), {
            name: file.name,
            size: file.size,
            data: b64,
            storagePath: null,
            url: null,
            updatedAt: serverTimestamp(),
            updatedBy: user?.id || null,
            version: increment(1)
          }, { merge: true });
          setFile(null);
          setProgress(100);
          setUploadError(null);
          setDebugInfo(prev => (prev? prev+'\n':'') + 'Base64 publié (fallback).');
          return; // on sort sans poser l'erreur
        } catch (fb64Err:any) {
          setDebugInfo(prev => (prev? prev+'\n':'') + 'Fallback base64 échoué: ' + (fb64Err?.message||fb64Err));
        }
      } else if ((isBucket404 || isCors) && file.size >= 2 * 1024 * 1024) {
        msg += '\nFallback base64 impossible: fichier > 2MB.';
      }
      setUploadError(msg);
      setDebugInfo(prev => (prev? prev+'\n':'') + 'Erreur finale.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!privileged || uploading) return;
    if (!confirm('Supprimer le PDF actuel ? Cette action est définitive.')) return;
    setUploadError(null);
    try {
      setUploading(true);
      const snap = await getDoc(doc(db, 'shared', 'programmePdf'));
      if (!snap.exists()) {
        setUploadError('Aucun PDF à supprimer.');
        return;
      }
      const data: any = snap.data();
      const oldPath = data?.storagePath;
      // Nettoyer le document (on laisse le doc exister pour éviter 404 côté listeners mais on retire les champs)
      await setDoc(doc(db, 'shared', 'programmePdf'), {
        name: null,
        size: null,
        storagePath: null,
        url: null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || null,
        version: (data?.version || 0) + 1
      }, { merge: true });
      if (oldPath) {
        try { await deleteObject(ref(storage, oldPath)); } catch (e:any){ if(e?.code!=='storage/object-not-found'){ console.warn('Suppression storage échouée', e);} }
      }
      setFile(null);
      setProgress(0);
    } catch (e:any) {
      console.error('Suppression PDF échouée', e);
      setUploadError('Erreur suppression: ' + (e?.message || 'inconnue'));
    } finally {
      setUploading(false);
    }
  };

  

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
        <div className="flex items-center gap-2 text-emerald-100 text-sm">
          <FileText className="h-4 w-4" />
          <span className="flex items-center gap-2">{name}{updatedAt && (Date.now() - updatedAt.getTime()) < 24*60*60*1000 && (<span className="text-[9px] bg-emerald-600/80 px-2 py-[1px] rounded-full">NEW</span>)}</span>
          {permError && <span className="text-red-300 text-[10px] ml-2">Accès refusé</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const el = document.getElementById('programme-pdf');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.classList.add('ring-2','ring-emerald-400','shadow-inner');
                setTimeout(()=>{
                  el.classList.remove('ring-2','ring-emerald-400','shadow-inner');
                }, 1600);
              }
            }}
            className="text-xs font-semibold px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow"
          >Voir dans la page</button>
          {privileged && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] cursor-pointer font-medium bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded shadow inline-flex items-center gap-1">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={e=>{ const f=e.target.files?.[0]; if(f && f.type==='application/pdf'){ setFile(f);} }}
                  className="hidden"
                />
                Choisir un PDF
              </label>
              {file && !uploading && (
                <span className="max-w-[180px] truncate text-[10px] px-2 py-1 rounded bg-emerald-800/40 text-emerald-100 border border-emerald-600/40" title={file.name}>{file.name}</span>
              )}
              {uploading && (
                <div className="w-32 h-2 bg-emerald-900/40 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{width: progress+'%'}} />
                </div>
              )}
              <button
                disabled={!file || uploading}
                onClick={handleUpload}
                className="text-[10px] px-3 py-1 rounded bg-emerald-700 disabled:opacity-40 text-white hover:bg-emerald-600 font-semibold"
              >Publier</button>
              {uploading && (
                <button
                  onClick={()=>{ taskRef.current?.cancel(); setUploading(false); setProgress(0); setUploadError('Upload annulé'); }}
                  className="text-[10px] px-2 py-1 rounded bg-emerald-900/60 text-emerald-200 hover:bg-emerald-900"
                >Annuler</button>
              )}
              {!uploading && (
                <button
                  onClick={handleDelete}
                  className="text-[10px] px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-semibold"
                >Supprimer</button>
              )}
            </div>
          )}
        </div>
      </div>
      {file && !uploading && privileged && (
        <div className="mt-1 text-[10px] text-emerald-300">Prêt à publier • {Math.round(file.size/1024)} Ko</div>
      )}
      {uploadError && <div className="text-[10px] mt-2 text-red-300 whitespace-pre-line">{uploadError}</div>}
      {debugInfo && <div className="text-[9px] mt-1 text-emerald-300/70 whitespace-pre-line font-mono">{debugInfo}</div>}
    </div>
  );
};

export default ProgrammePdfTopBar;


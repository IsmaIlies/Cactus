import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface HologramSales3DProps {
  hourlyCounts: number[]; // 24 valeurs
  onClose: () => void;
  title?: string;
}

const HologramSales3D: React.FC<HologramSales3DProps> = ({ hourlyCounts, onClose, title }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const barsRef = useRef<THREE.Mesh[]>([]);
  const maxVal = Math.max(1, ...hourlyCounts);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617');

    const camera = new THREE.PerspectiveCamera(
      55,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(-8, 10, 18);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(30, 30, 0x0ea5e9, 0x1e3a8a);
    scene.add(grid);

    const ambient = new THREE.AmbientLight(0x66ccff, 0.7);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 12, 8);
    scene.add(dir);

    const group = new THREE.Group();
    scene.add(group);

    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0x3c96ff,
      transparent: true,
      opacity: 0.85,
      emissive: 0x0d47a1,
      emissiveIntensity: 0.6,
    });

    barsRef.current = [];
    hourlyCounts.forEach((val, hour) => {
      const hNorm = (val / maxVal) * 8; // hauteur max = 8
      const geom = new THREE.BoxGeometry(0.8, hNorm || 0.1, 0.8);
      const mesh = new THREE.Mesh(geom, barMaterial.clone());
      mesh.position.set(hour - 11.5, hNorm / 2 || 0.05, 0);
      (mesh.material as THREE.MeshStandardMaterial).color = new THREE.Color(
        new THREE.Color().setHSL(0.55 - (val / (maxVal * 1.5)), 0.85, 0.55)
      );
      group.add(mesh);
      barsRef.current.push(mesh);
    });

    const makeLabel = (text: string, x: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '26px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.8, 0.9, 1);
      sprite.position.set(x, 0.2, 1.2);
      group.add(sprite);
    };
    hourlyCounts.forEach((_v, hour) => makeLabel(String(hour), hour - 11.5));

    let frame = 0;
    const animate = () => {
      frame++;
      barsRef.current.forEach((b, i) => {
        const base = (hourlyCounts[i] / maxVal) * 8 || 0.1;
        const pulse = Math.sin(frame * 0.02 + i) * 0.15;
        b.scale.y = (base + pulse) / (base || 0.1);
        b.position.y = (base + pulse) / 2;
      });
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [hourlyCounts, maxVal]);

  return (
    <div className="fixed inset-0 z-[200] backdrop-blur-md bg-slate-900/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 text-cyan-200 text-sm">
        <span className="font-semibold">{title || 'Hologram Mode — Densité horaire ventes (jour courant)'}</span>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
        >
          Fermer
        </button>
      </div>
      <div ref={mountRef} className="flex-1" />
    </div>
  );
};

export default HologramSales3D;

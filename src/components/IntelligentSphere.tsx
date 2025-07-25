import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls, Html } from "@react-three/drei";

interface Suggestion {
  id: string;
  type: "relance" | "script" | "offre";
  text: string;
  context: string;
  priority: "low" | "medium" | "high";
}

interface ScriptAlert {
  id: string;
  type: "missing_step" | "legal_required" | "order_error";
  message: string;
  severity: "warning" | "error";
}

interface IntelligentSphereProps {
  isListening: boolean;
  isAnalyzing: boolean;
  suggestionLevel: number;
  suggestions?: Suggestion[];
  scriptAlerts?: ScriptAlert[];
  completedSteps?: string[];
}

// Composant pour afficher une bulle de texte flottante améliorée
function FloatingBubble({
  text,
  type,
  priority,
  delay = 0,
  index = 0,
  totalBubbles = 1,
}: {
  text: string;
  type: "suggestion" | "alert";
  priority: "low" | "medium" | "high" | "warning" | "error";
  delay?: number;
  index?: number;
  totalBubbles?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(new THREE.Vector3());
  const bubbleRef = useRef<THREE.Group>(null);

  // Positionner chaque bulle sur un point de la sphère (pour éviter le chevauchement)
  useEffect(() => {
    setVisible(true);
    // Utiliser les points de la sphère pour placer les bulles
    // On suppose que le parent passe un prop "bubblePositions" (tableau de Vector3)
    // Si non fourni, fallback sur l'ancien système (arc)
    if (
      typeof window !== "undefined" &&
      (window as any).bubblePositions &&
      (window as any).bubblePositions[index]
    ) {
      setCurrentPosition(
        (window as any).bubblePositions[index].clone().multiplyScalar(1.15)
      );
    } else {
      // Fallback arc
      const arc = Math.PI * 1.22;
      const startAngle = -arc / 2;
      const angleStep = arc / (totalBubbles > 1 ? totalBubbles - 1 : 1);
      const angle = startAngle + index * angleStep;
      const radius = 1.2;
      setCurrentPosition(
        new THREE.Vector3(
          Math.sin(angle) * radius,
          Math.cos(angle) * radius * 0.85 + 0.7,
          0
        )
      );
    }
  }, [index, totalBubbles]);

  // Animation d'éloignement/rapprochement continu
  useFrame((state) => {
    if (bubbleRef.current && visible) {
      // Animation : le rayon varie entre 1.2 et 2.2 en continu, bulles plus étalées
      const t = state.clock.getElapsedTime();
      const arc = Math.PI * 1.22; // ~220°
      const startAngle = -arc / 2;
      const angleStep = arc / (totalBubbles > 1 ? totalBubbles - 1 : 1);
      const angle = startAngle + index * angleStep;
      const radius = 1.7 + Math.sin(t + index) * 0.5; // Oscillation
      const pos = new THREE.Vector3(
        Math.sin(angle) * radius,
        Math.cos(angle) * radius * 0.85 + 0.7,
        0
      );
      bubbleRef.current.position.copy(pos);
      bubbleRef.current.lookAt(state.camera.position);
    }
  });

  // Désactiver l'animation flottante : position fixe
  useFrame((state) => {
    if (bubbleRef.current && visible) {
      bubbleRef.current.position.copy(currentPosition);
      bubbleRef.current.lookAt(state.camera.position);
    }
  });

  if (!visible) return null;

  const getBubbleColor = () => {
    if (type === "alert") {
      return priority === "error" ? "#ef4444" : "#f59e0b";
    }
    switch (priority) {
      case "high":
        return "#10b981";
      case "medium":
        return "#3b82f6";
      default:
        return "#6b7280";
    }
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    console.log("🎯 Suggestion cliquée:", text);

    // Effet visuel lors du clic
    if (bubbleRef.current) {
      bubbleRef.current.scale.setScalar(1.3);
      setTimeout(() => {
        if (bubbleRef.current) {
          bubbleRef.current.scale.setScalar(1);
        }
      }, 200);
    }

    // Action selon le type
    if (type === "suggestion") {
      alert(
        `💡 Suggestion: ${text}\n\nCette fonctionnalité sera intégrée avec votre CRM Canal+`
      );
    } else {
      alert(`⚠️ Alerte: ${text}`);
    }
  };

  return (
    <group ref={bubbleRef} position={currentPosition}>
      <Html
        position={[0, 0, 0]}
        center
        distanceFactor={18}
        style={{
          transform: `scale(${
            0.4 + (priority === "high" ? 0.1 : priority === "medium" ? 0.05 : 0)
          })`,
          opacity: visible ? 0.95 : 0,
          transition: "all 0.3s ease-in-out",
          pointerEvents: "auto",
          zIndex: 1000 + index,
          userSelect: "none",
        }}
        // Forcer la bulle à rester dans le viewport
        occlude={false}
        transform={false}
      >
        <div
          className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-2 border shadow-xl cursor-pointer hover:scale-105 hover:shadow-2xl transition-all duration-200"
          style={{
            borderColor: getBubbleColor(),
            boxShadow: `0 4px 15px ${getBubbleColor()}50, 0 0 8px ${getBubbleColor()}30`,
            backdropFilter: "blur(8px)",
            minWidth: "60px",
            maxWidth: "140px",
            fontSize: "11px",
            lineHeight: "1.2",
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.boxShadow = `0 6px 20px ${getBubbleColor()}60, 0 0 12px ${getBubbleColor()}40`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = `0 4px 15px ${getBubbleColor()}50, 0 0 8px ${getBubbleColor()}30`;
          }}
        >
          <div className="text-white font-medium leading-tight text-center">
            {text.length > 40 ? text.substring(0, 37) + "..." : text}
          </div>
          {type === "suggestion" && (
            <div className="text-center mt-1">
              <div
                className="inline-block px-1 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: getBubbleColor() + "25",
                  color: getBubbleColor(),
                  fontSize: "9px",
                }}
              >
                Clic
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

// Composant principal de la sphère réseau
function NetworkSphere({
  radius = 3,
  isListening,
  isAnalyzing,
  suggestionLevel,
  suggestions = [],
  scriptAlerts = [],
}: {
  radius: number;
  isListening: boolean;
  isAnalyzing: boolean;
  suggestionLevel: number;
  suggestions: Suggestion[];
  scriptAlerts: ScriptAlert[];
}) {
  // Génération d'une grille géodésique avec intersections
  const { points, lines } = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    const segments: [THREE.Vector3, THREE.Vector3][] = [];

    // Créer une grille géodésique basée sur un icosaèdre
    const divisions = 3;
    const phi = (1 + Math.sqrt(5)) / 2; // Nombre d'or

    // Vertices d'un icosaèdre normalisés
    const icosahedronVertices = [
      [-1, phi, 0],
      [1, phi, 0],
      [-1, -phi, 0],
      [1, -phi, 0],
      [0, -1, phi],
      [0, 1, phi],
      [0, -1, -phi],
      [0, 1, -phi],
      [phi, 0, -1],
      [phi, 0, 1],
      [-phi, 0, -1],
      [-phi, 0, 1],
    ].map(([x, y, z]) => {
      const length = Math.sqrt(x * x + y * y + z * z);
      return new THREE.Vector3(
        (x / length) * radius,
        (y / length) * radius,
        (z / length) * radius
      );
    });

    // Faces de l'icosaèdre
    const faces = [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ];

    // Subdiviser chaque face pour créer des points aux intersections
    faces.forEach((face) => {
      const [a, b, c] = face.map((i) => icosahedronVertices[i]);

      for (let i = 0; i <= divisions; i++) {
        for (let j = 0; j <= divisions - i; j++) {
          const u = i / divisions;
          const v = j / divisions;
          const w = 1 - u - v;

          if (w >= 0) {
            const point = new THREE.Vector3()
              .addScaledVector(a, w)
              .addScaledVector(b, u)
              .addScaledVector(c, v)
              .normalize()
              .multiplyScalar(radius);

            // Éviter les doublons en vérifiant la distance
            const exists = positions.some((p) => p.distanceTo(point) < 0.1);
            if (!exists) {
              positions.push(point);
            }
          }
        }
      }
    });

    // Créer les connexions entre points proches (lignes du réseau)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const distance = positions[i].distanceTo(positions[j]);
        if (distance < radius * 0.7) {
          // Connecter les points proches
          segments.push([positions[i], positions[j]]);
        }
      }
    }

    return { points: positions, lines: segments };
  }, [radius]);

  const groupRef = useRef<THREE.Group>(null);
  const [cyclicSuggestions, setCyclicSuggestions] = useState<Suggestion[]>([]);

  // Suggestions d'exemple qui apparaissent automatiquement
  const exampleSuggestions: Suggestion[] = [
    {
      id: "ex1",
      type: "relance",
      text: "Demander les préférences de genre",
      context: "Découverte client",
      priority: "high",
    },
    {
      id: "ex2",
      type: "offre",
      text: "Proposer Canal+ Sport avec Champions League",
      context: "Client sportif",
      priority: "high",
    },
    {
      id: "ex3",
      type: "script",
      text: "N'oubliez pas les mentions légales",
      context: "Respect du script",
      priority: "medium",
    },
    {
      id: "ex4",
      type: "relance",
      text: 'Rebondir sur Netflix : "Nous incluons Netflix"',
      context: "Client mentionne Netflix",
      priority: "high",
    },
    {
      id: "ex5",
      type: "offre",
      text: "Offre Ciné-Séries : Netflix + Paramount+",
      context: "Amateur de séries",
      priority: "medium",
    },
    {
      id: "ex6",
      type: "script",
      text: 'Réponse objection prix : "Tarif bloqué 24 mois"',
      context: "Objection tarifaire",
      priority: "high",
    },
    {
      id: "ex7",
      type: "relance",
      text: "Questions sur les enfants/ados",
      context: "Famille avec enfants",
      priority: "low",
    },
    {
      id: "ex8",
      type: "offre",
      text: "Canal+ 100% : Sport + Cinéma + Séries",
      context: "Client indécis",
      priority: "medium",
    },
  ];

  // Cycle automatique des suggestions d'exemple
  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      setCyclicSuggestions((prev) => {
        const newSuggestions = [...prev];

        // Ajouter une nouvelle suggestion
        if (newSuggestions.length < 4) {
          // Max 4 suggestions visibles
          newSuggestions.push({
            ...exampleSuggestions[currentIndex % exampleSuggestions.length],
            id: `cyclic-${currentIndex}-${Date.now()}`,
          });
        } else {
          // Remplacer la plus ancienne
          newSuggestions.shift();
          newSuggestions.push({
            ...exampleSuggestions[currentIndex % exampleSuggestions.length],
            id: `cyclic-${currentIndex}-${Date.now()}`,
          });
        }

        currentIndex++;
        return newSuggestions;
      });
    }, 3000); // Nouvelle suggestion toutes les 3 secondes

    return () => clearInterval(interval);
  }, []);

  // Combiner les suggestions réelles avec les cycliques
  const allSuggestions = [...suggestions, ...cyclicSuggestions];

  // Animation : faire osciller les points de la sphère (et donc les lignes) en continu
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.getElapsedTime();
      // On fait osciller le rayon de chaque point individuellement
      groupRef.current.children.forEach((child, idx) => {
        if (child.type === "Mesh" && child.position) {
          // Récupérer la position initiale (normalisée)
          const mesh = child;
          const base = points[idx].clone().normalize();
          // Rayon oscillant entre 2.2 et 3.2
          const radius = 2.7 + Math.sin(t + idx) * 0.5;
          const newPos = base.multiplyScalar(radius);
          mesh.position.set(newPos.x, newPos.y, newPos.z);
        }
      });
    }
  });

  // Couleurs selon l'état
  const getPointColor = () => {
    if (isAnalyzing) return "#f59e0b"; // Orange pour analyse
    if (isListening) return "#10b981"; // Vert pour écoute
    if (suggestionLevel > 0.5) return "#3b82f6"; // Bleu pour suggestions
    return "#6b7280"; // Gris par défaut
  };

  const getLineColor = () => {
    if (isAnalyzing) return "#f59e0b40";
    if (isListening) return "#10b98140";
    if (suggestionLevel > 0.5) return "#3b82f640";
    return "#6b728040";
  };

  const pointSize = 0.02 + (isListening ? 0.02 : 0) + suggestionLevel * 0.03;

  // Calculer les positions des bulles à afficher (suggestions + alertes)
  // Nouvelle logique :
  // - On ne prend que les points "médian" (pas trop excentrés)
  // - On mélange l'ordre à chaque rendu pour éviter toujours les mêmes points
  // - On centre sur la partie supérieure de la sphère (y > 0)
  // Nouvelle logique :
  // Afficher les bulles uniquement sur les points de la surface visible (face caméra)
  // On prend les points dont le vecteur forme un angle < 90° avec la caméra (dot > 0)
  const bubblePositions = useMemo(() => {
    const total = allSuggestions.length + scriptAlerts.length;
    if (total === 0) return [];
    // Déterminer la direction caméra (z = 1 par défaut, car sphère statique)
    const cameraDir = new THREE.Vector3(0, 0, 1);
    // Filtrer les points "visibles" (face caméra)
    let filtered = points.filter(
      (p) => p.clone().normalize().dot(cameraDir) > 0.15 && p.y > 0
    );
    // Si pas assez de points, élargir le critère
    if (filtered.length < total)
      filtered = points.filter((p) => p.clone().normalize().dot(cameraDir) > 0);
    if (filtered.length < total) filtered = points;
    // Mélanger l'ordre à chaque rendu (shuffle)
    const shuffled = filtered.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Prendre les N premiers
    return shuffled.slice(0, total);
  }, [points, allSuggestions.length, scriptAlerts.length, Math.random()]);

  // Rendre les positions accessibles globalement pour FloatingBubble (hack simple)
  if (typeof window !== "undefined") {
    (window as any).bubblePositions = bubblePositions;
  }

  return (
    <group ref={groupRef}>
      {/* Points de la sphère */}
      {points.map((pos, idx) => (
        <mesh position={pos} key={`point-${idx}`}>
          <sphereGeometry args={[pointSize, 8, 8]} />
          <meshBasicMaterial color={getPointColor()} />
        </mesh>
      ))}

      {/* Lignes de connexion */}
      {lines.map(([start, end], idx) => (
        <line key={`line-${idx}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={
                new Float32Array([
                  start.x,
                  start.y,
                  start.z,
                  end.x,
                  end.y,
                  end.z,
                ])
              }
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={getLineColor()} transparent opacity={0.6} />
        </line>
      ))}

      {/* Bulles de suggestions sur les points éloignés */}
      {allSuggestions.map((suggestion, idx) => {
        const totalBubbles = allSuggestions.length + scriptAlerts.length;
        return (
          <FloatingBubble
            key={suggestion.id}
            text={suggestion.text}
            type="suggestion"
            priority={suggestion.priority}
            delay={idx * 300}
            index={idx}
            totalBubbles={totalBubbles}
          />
        );
      })}

      {/* Bulles d'alertes sur les points éloignés */}
      {scriptAlerts.map((alert, idx) => {
        const totalBubbles = allSuggestions.length + scriptAlerts.length;
        const globalIndex = allSuggestions.length + idx;
        return (
          <FloatingBubble
            key={alert.id}
            text={alert.message}
            type="alert"
            priority={alert.severity}
            delay={globalIndex * 200}
            index={globalIndex}
            totalBubbles={totalBubbles}
          />
        );
      })}
    </group>
  );
}

export default function IntelligentSphere({
  isListening,
  isAnalyzing,
  suggestionLevel,
  suggestions = [],
  scriptAlerts = [],
}: IntelligentSphereProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 60 }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      <NetworkSphere
        radius={3}
        isListening={isListening}
        isAnalyzing={isAnalyzing}
        suggestionLevel={suggestionLevel}
        suggestions={suggestions}
        scriptAlerts={scriptAlerts}
      />

      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={5}
        maxDistance={12}
        autoRotate={false}
      />
    </Canvas>
  );
}

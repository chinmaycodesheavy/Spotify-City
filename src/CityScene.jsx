import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, PerspectiveCamera, Stars } from "@react-three/drei";

const CITY_SCALE = 1.65;

const GENRE_COLORS = {
  electronic: { color: "#00f5ff", accent: "#7b2fff" },
  hiphop: { color: "#ff6b00", accent: "#ff2d55" },
  indie: { color: "#a8ff78", accent: "#78ffd6" },
  classical: { color: "#ffd700", accent: "#fff3b0" },
  pop: { color: "#ff69b4", accent: "#ff1493" },
  jazz: { color: "#c77dff", accent: "#9d4edd" },
};

function getGenrePalette(genre) {
  return GENRE_COLORS[genre] || GENRE_COLORS.indie;
}

function cityPos(x, z) {
  return [x * CITY_SCALE, 0, z * CITY_SCALE];
}

function getBuildingStyle(artist, metrics, timeMultiplier = 1, beatPulse = 0) {
  const playRatio = (artist.plays || 0) / metrics.maxPlays;
  const followerRatio = (artist.followers || 0) / metrics.maxFollowers;
  const popularityRatio = (artist.popularity || 0) / 100;
  const recencyRatio = 1 - Math.min(1, (artist.lastPlayed || metrics.maxLastPlayed) / metrics.maxLastPlayed);
  const energy = artist.energy ?? 0.55;
  const danceability = artist.danceability ?? 0.55;
  const variationSeed = artist.id.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const widthBias = 0.9 + (variationSeed % 5) * 0.05;
  const depthBias = 0.88 + (variationSeed % 7) * 0.04;
  const heightBias = 0.86 + (variationSeed % 4) * 0.06;
  const skylineScale = 0.78 + timeMultiplier * 0.42;
  const pulseLift = 1 + beatPulse * (0.03 + energy * 0.05);

  const podiumWidth = (2.8 + followerRatio * 2.1 + popularityRatio * 0.7) * widthBias;
  const podiumDepth = (2.5 + popularityRatio * 1.6 + danceability * 0.7) * depthBias;
  const podiumHeight = 0.7 + popularityRatio * 0.8;
  const towerWidth = podiumWidth * (0.62 + energy * 0.1);
  const towerDepth = podiumDepth * (0.56 + danceability * 0.1);
  const towerHeight = (5.5 + playRatio * 13 + recencyRatio * 3.5) * heightBias * skylineScale * pulseLift;
  const midWidth = towerWidth * (0.8 + energy * 0.06);
  const midDepth = towerDepth * (0.8 + danceability * 0.06);
  const midHeight = (1.8 + energy * 1.9) * (0.92 + timeMultiplier * 0.16);
  const crownWidth = midWidth * 1.12;
  const crownDepth = midDepth * 1.12;
  const crownHeight = 0.18 + recencyRatio * 0.18;
  const haloRadius = podiumWidth * 0.55 + energy * 0.2;
  const totalHeight = podiumHeight + towerHeight + midHeight + crownHeight;

  return {
    playRatio,
    recencyRatio,
    energy,
    danceability,
    podiumWidth,
    podiumDepth,
    podiumHeight,
    towerWidth,
    towerDepth,
    towerHeight,
    midWidth,
    midDepth,
    midHeight,
    crownWidth,
    crownDepth,
    crownHeight,
    haloRadius,
    totalHeight,
    variationSeed,
  };
}

function FacadeWindows({ width, depth, height, color, accent }) {
  const rows = Math.max(5, Math.floor(height / 2.6));
  return (
    <group>
      {Array.from({ length: rows }).map((_, index) => {
        const y = -height / 2 + 0.85 + index * (height / rows);
        const windowColor = index % 2 === 0 ? color : accent;
        return (
          <group key={index}>
            <mesh position={[0, y, depth / 2 + 0.03]}>
              <planeGeometry args={[width * 0.58, 0.08]} />
              <meshBasicMaterial color={windowColor} transparent opacity={0.18} />
            </mesh>
            <mesh position={[width / 2 + 0.03, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[depth * 0.54, 0.08]} />
              <meshBasicMaterial color={accent} transparent opacity={0.14} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function RooftopGarden({ width, depth, palette, variant = 0 }) {
  const bedWidth = Math.max(0.24, width * 0.22);
  const bedDepth = Math.max(0.18, depth * 0.18);
  const offsets = variant % 3 === 0
    ? [[-width * 0.18, -depth * 0.12], [width * 0.16, depth * 0.1]]
    : variant % 3 === 1
      ? [[0, -depth * 0.14], [0, depth * 0.14]]
      : [[-width * 0.16, 0], [width * 0.16, 0]];

  return (
    <group>
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[width * 0.58, 0.04, depth * 0.4]} />
        <meshStandardMaterial color="#2f4f3b" emissive="#355d42" emissiveIntensity={0.08} roughness={0.95} />
      </mesh>
      {offsets.map(([x, z], index) => (
        <group key={index} position={[x, 0.055, z]}>
          <mesh>
            <boxGeometry args={[bedWidth, 0.08, bedDepth]} />
            <meshStandardMaterial color="#1a2a1f" emissive={palette.accent} emissiveIntensity={0.04} roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[bedWidth * 0.84, 0.05, bedDepth * 0.84]} />
            <meshStandardMaterial color="#4f8f5b" emissive="#6dbd72" emissiveIntensity={0.06} roughness={0.98} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BuildingMesh({ artist, metrics, selectedArtist, hoveredArtist, onHover, onLeave, onSelect, beatPulse, timeMultiplier }) {
  const palette = getGenrePalette(artist.genre);
  const style = getBuildingStyle(artist, metrics, timeMultiplier, beatPulse);
  const active = selectedArtist?.id === artist.id || hoveredArtist?.id === artist.id;
  const basePosition = useMemo(() => cityPos(artist.x, artist.z), [artist.x, artist.z]);
  const sideWingOffset = style.podiumWidth * 0.36;
  const flareRotation = style.variationSeed % 7;
  const roofLift = -0.02;
  const bodyColor = active ? "#23324b" : "#151d2b";
  const towerColor = active ? "#31496b" : "#202a3d";
  const topColor = active ? "#425a80" : "#29344a";
  const trimColor = active ? palette.color : palette.accent;
  const roofVariant = style.variationSeed % 5;
  const roofWidthFactor = 0.82 + (style.variationSeed % 4) * 0.08;
  const roofDepthFactor = 0.8 + (style.variationSeed % 3) * 0.1;
  const beaconOffsetX = ((style.variationSeed % 5) - 2) * 0.06 * style.crownWidth;
  const beaconOffsetZ = (((style.variationSeed >> 1) % 5) - 2) * 0.06 * style.crownDepth;
  const buildingFamily = artist.genre === "electronic"
    ? "spire"
    : artist.genre === "hiphop"
      ? "block"
      : artist.genre === "classical"
        ? "crown"
        : artist.genre === "jazz"
          ? "terrace"
          : artist.genre === "pop"
            ? "stage"
            : "setback";
  const blockBaseHeight = style.towerHeight * 0.58;
  const blockTopHeight = style.towerHeight * 0.3;
  const crownTopHeight = style.midHeight * 0.82;
  const terraceBaseHeight = style.towerHeight * 0.46;
  const terraceMidHeight = style.towerHeight * 0.24;
  const terraceTopHeight = style.midHeight * 0.46;
  const stageBaseHeight = style.towerHeight * 0.52;
  const stageTopHeight = style.midHeight * 0.58;
  const setbackBaseHeight = style.towerHeight * 0.44;
  const setbackMidHeight = style.towerHeight * 0.24;
  const setbackTopHeight = style.midHeight * 0.5;
  const roofSurfaceY = buildingFamily === "spire"
    ? style.podiumHeight + style.towerHeight + style.midHeight
    : buildingFamily === "block"
      ? style.podiumHeight + blockBaseHeight + blockTopHeight
      : buildingFamily === "crown"
        ? style.podiumHeight + style.towerHeight + crownTopHeight
        : buildingFamily === "terrace"
          ? style.podiumHeight + terraceBaseHeight + terraceMidHeight + terraceTopHeight
          : buildingFamily === "stage"
            ? style.podiumHeight + stageBaseHeight + stageTopHeight
            : style.podiumHeight + setbackBaseHeight + setbackMidHeight + setbackTopHeight;
  const facadeHeight = Math.max(2.4, roofSurfaceY - style.podiumHeight - 0.12);
  const facadeCenterY = style.podiumHeight + facadeHeight / 2;

  return (
    <group
      position={basePosition}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(artist);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onLeave();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(artist);
      }}
    >
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[style.haloRadius, 32]} />
        <meshBasicMaterial color={palette.color} transparent opacity={0.04 + style.recencyRatio * 0.04} />
      </mesh>

      <mesh position={[0, style.podiumHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[style.podiumWidth, style.podiumHeight, style.podiumDepth]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={palette.color}
          emissiveIntensity={0.1}
          roughness={0.76}
          metalness={0.12}
        />
      </mesh>

      {buildingFamily === "spire" && (
        <>
          <mesh
            position={[0, style.podiumHeight + style.towerHeight / 2, 0]}
            rotation={[0, (flareRotation / 7) * Math.PI * 0.25, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[style.towerWidth * 0.92, style.towerHeight, style.towerDepth * 0.78]} />
            <meshStandardMaterial
              color={towerColor}
              emissive={palette.color}
              emissiveIntensity={0.16 + style.playRatio * 0.08}
              roughness={0.44}
              metalness={0.22}
            />
          </mesh>
          <mesh position={[0, style.podiumHeight + style.towerHeight + style.midHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.midWidth * 0.72, style.midHeight, style.midDepth * 0.68]} />
            <meshStandardMaterial
              color={topColor}
              emissive={palette.accent}
              emissiveIntensity={0.12 + style.energy * 0.08}
              roughness={0.36}
              metalness={0.24}
            />
          </mesh>
          <mesh position={[0, roofSurfaceY - 0.12, 0]} castShadow>
            <coneGeometry args={[style.midWidth * 0.14, 0.28 + style.energy * 0.18, 5]} />
            <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.2} metalness={0.24} roughness={0.34} />
          </mesh>
        </>
      )}

      {buildingFamily === "block" && (
        <>
          <mesh position={[0, style.podiumHeight + blockBaseHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 1.12, blockBaseHeight, style.towerDepth * 1.02]} />
            <meshStandardMaterial color={towerColor} emissive={palette.color} emissiveIntensity={0.14} roughness={0.46} metalness={0.2} />
          </mesh>
          <mesh position={[0, style.podiumHeight + blockBaseHeight + blockTopHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 0.84, blockTopHeight, style.towerDepth * 0.74]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.1} roughness={0.42} metalness={0.18} />
          </mesh>
          <mesh position={[0, roofSurfaceY - 0.05, 0]} castShadow>
            <boxGeometry args={[style.towerWidth * 1.08, 0.18, style.towerDepth * 1.02]} />
            <meshStandardMaterial color={bodyColor} emissive={trimColor} emissiveIntensity={0.16} roughness={0.5} metalness={0.16} />
          </mesh>
        </>
      )}

      {buildingFamily === "crown" && (
        <>
          <mesh position={[0, style.podiumHeight + style.towerHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 0.94, style.towerHeight, style.towerDepth * 0.88]} />
            <meshStandardMaterial color={towerColor} emissive={palette.color} emissiveIntensity={0.14} roughness={0.46} metalness={0.22} />
          </mesh>
          <mesh position={[0, style.podiumHeight + style.towerHeight + crownTopHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.midWidth * 0.94, crownTopHeight, style.midDepth * 0.9]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.12} roughness={0.38} metalness={0.2} />
          </mesh>
          <mesh position={[-style.midWidth * 0.22, roofSurfaceY - 0.06, 0]} castShadow>
            <boxGeometry args={[style.midWidth * 0.15, 0.12, style.midDepth * 0.15]} />
            <meshStandardMaterial color={bodyColor} emissive={trimColor} emissiveIntensity={0.18} roughness={0.5} metalness={0.12} />
          </mesh>
          <mesh position={[0, roofSurfaceY - 0.08, 0]} castShadow>
            <boxGeometry args={[style.midWidth * 0.18, 0.18, style.midDepth * 0.18]} />
            <meshStandardMaterial color={bodyColor} emissive={trimColor} emissiveIntensity={0.2} roughness={0.46} metalness={0.14} />
          </mesh>
          <mesh position={[style.midWidth * 0.22, roofSurfaceY - 0.06, 0]} castShadow>
            <boxGeometry args={[style.midWidth * 0.15, 0.12, style.midDepth * 0.15]} />
            <meshStandardMaterial color={bodyColor} emissive={trimColor} emissiveIntensity={0.18} roughness={0.5} metalness={0.12} />
          </mesh>
        </>
      )}

      {buildingFamily === "terrace" && (
        <>
          <mesh position={[0, style.podiumHeight + terraceBaseHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 1.08, terraceBaseHeight, style.towerDepth * 1.05]} />
            <meshStandardMaterial color={towerColor} emissive={palette.color} emissiveIntensity={0.12} roughness={0.46} metalness={0.18} />
          </mesh>
          <mesh position={[0, style.podiumHeight + terraceBaseHeight + terraceMidHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 0.82, terraceMidHeight, style.towerDepth * 0.8]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.1} roughness={0.42} metalness={0.16} />
          </mesh>
          <mesh position={[0, style.podiumHeight + terraceBaseHeight + terraceMidHeight + terraceTopHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.midWidth * 0.64, terraceTopHeight, style.midDepth * 0.62]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.1} roughness={0.38} metalness={0.16} />
          </mesh>
        </>
      )}

      {buildingFamily === "stage" && (
        <>
          <mesh position={[0, style.podiumHeight + stageBaseHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth, stageBaseHeight, style.towerDepth * 0.84]} />
            <meshStandardMaterial color={towerColor} emissive={palette.color} emissiveIntensity={0.12} roughness={0.46} metalness={0.2} />
          </mesh>
          <mesh position={[0, style.podiumHeight + stageBaseHeight + stageTopHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.midWidth * 0.86, stageTopHeight, style.midDepth * 0.74]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.12} roughness={0.38} metalness={0.18} />
          </mesh>
          <mesh position={[0, roofSurfaceY - 0.05, 0]} castShadow rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[style.crownWidth * 0.62, 0.08, style.crownDepth * 0.62]} />
            <meshStandardMaterial color={bodyColor} emissive={trimColor} emissiveIntensity={0.16} roughness={0.46} metalness={0.14} />
          </mesh>
        </>
      )}

      {buildingFamily === "setback" && (
        <>
          <mesh position={[0, style.podiumHeight + setbackBaseHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 1.02, setbackBaseHeight, style.towerDepth * 0.96]} />
            <meshStandardMaterial color={towerColor} emissive={palette.color} emissiveIntensity={0.12} roughness={0.46} metalness={0.2} />
          </mesh>
          <mesh position={[0, style.podiumHeight + setbackBaseHeight + setbackMidHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.towerWidth * 0.8, setbackMidHeight, style.towerDepth * 0.76]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.1} roughness={0.4} metalness={0.18} />
          </mesh>
          <mesh position={[0, style.podiumHeight + setbackBaseHeight + setbackMidHeight + setbackTopHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[style.midWidth * 0.62, setbackTopHeight, style.midDepth * 0.58]} />
            <meshStandardMaterial color={topColor} emissive={palette.accent} emissiveIntensity={0.1} roughness={0.38} metalness={0.16} />
          </mesh>
        </>
      )}

      <mesh position={[-sideWingOffset, style.podiumHeight + 0.55, 0]} castShadow>
        <boxGeometry args={[style.podiumWidth * 0.26, 1.1 + style.danceability * 0.9, style.podiumDepth * 0.6]} />
        <meshStandardMaterial color={bodyColor} emissive={palette.accent} emissiveIntensity={0.06} roughness={0.8} metalness={0.08} />
      </mesh>

      <mesh position={[sideWingOffset, style.podiumHeight + 0.7, 0]} castShadow>
        <boxGeometry args={[style.podiumWidth * 0.22, 1.4 + style.energy * 1.2, style.podiumDepth * 0.44]} />
        <meshStandardMaterial color={bodyColor} emissive={palette.color} emissiveIntensity={0.06} roughness={0.8} metalness={0.08} />
      </mesh>

      <group position={[0, facadeCenterY, 0]}>
        <FacadeWindows
          width={style.towerWidth * 0.96}
          depth={style.towerDepth * 0.92}
          height={facadeHeight}
          color={palette.color}
          accent={palette.accent}
        />
      </group>

      <mesh position={[0, Math.max(0.42, style.podiumHeight * 0.45), style.podiumDepth / 2 + 0.04]}>
        <planeGeometry args={[Math.max(0.34, style.podiumWidth * 0.12), Math.max(0.62, style.podiumHeight * 0.72)]} />
        <meshBasicMaterial color={trimColor} transparent opacity={0.18} />
      </mesh>

      <mesh position={[0, Math.max(0.42, style.podiumHeight * 0.45), style.podiumDepth / 2 + 0.05]}>
        <planeGeometry args={[Math.max(0.22, style.podiumWidth * 0.08), Math.max(0.48, style.podiumHeight * 0.56)]} />
        <meshBasicMaterial color="#e7fbff" transparent opacity={0.14} />
      </mesh>

      <mesh position={[0, roofSurfaceY - style.crownHeight / 2, 0]} castShadow>
        <boxGeometry args={[style.crownWidth * roofWidthFactor, style.crownHeight, style.crownDepth * roofDepthFactor]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={trimColor}
          emissiveIntensity={0.18}
          roughness={0.48}
          metalness={0.12}
        />
      </mesh>

      <group position={[0, roofSurfaceY + 0.01, 0]}>
        <RooftopGarden
          width={style.crownWidth * roofWidthFactor * 0.92}
          depth={style.crownDepth * roofDepthFactor * 0.92}
          palette={palette}
          variant={roofVariant}
        />
      </group>

      {roofVariant === 0 && (
        <mesh position={[0, roofSurfaceY + roofLift, 0]} castShadow>
          <boxGeometry args={[style.crownWidth * 0.42, 0.06, style.crownDepth * 0.24]} />
          <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.12} roughness={0.5} metalness={0.1} />
        </mesh>
      )}

      {roofVariant === 1 && (
        <mesh position={[style.crownWidth * 0.16, roofSurfaceY + roofLift, -style.crownDepth * 0.08]} castShadow>
          <boxGeometry args={[style.crownWidth * 0.24, 0.08, style.crownDepth * 0.24]} />
          <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.1} roughness={0.54} metalness={0.08} />
        </mesh>
      )}

      {roofVariant === 2 && (
        <>
          <mesh position={[-style.crownWidth * 0.16, roofSurfaceY + roofLift, 0]} castShadow>
            <boxGeometry args={[style.crownWidth * 0.18, 0.06, style.crownDepth * 0.2]} />
            <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.1} roughness={0.52} metalness={0.08} />
          </mesh>
          <mesh position={[style.crownWidth * 0.16, roofSurfaceY + roofLift, 0]} castShadow>
            <boxGeometry args={[style.crownWidth * 0.18, 0.06, style.crownDepth * 0.2]} />
            <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.1} roughness={0.52} metalness={0.08} />
          </mesh>
        </>
      )}

      {roofVariant === 3 && (
        <mesh position={[0, roofSurfaceY + roofLift, style.crownDepth * 0.12]} castShadow rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[style.crownWidth * 0.24, 0.06, style.crownDepth * 0.24]} />
          <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.1} roughness={0.52} metalness={0.08} />
        </mesh>
      )}

      {roofVariant === 4 && (
        <mesh position={[0, roofSurfaceY + roofLift, 0]} castShadow>
          <cylinderGeometry args={[style.crownWidth * 0.08, style.crownWidth * 0.08, 0.08, 10]} />
          <meshStandardMaterial color={topColor} emissive={trimColor} emissiveIntensity={0.12} roughness={0.5} metalness={0.12} />
        </mesh>
      )}

      <mesh position={[beaconOffsetX, roofSurfaceY + roofLift + 0.01, beaconOffsetZ]}>
        <cylinderGeometry args={[active ? 0.22 : 0.15, active ? 0.22 : 0.15, 0.08, 14]} />
        <meshBasicMaterial color={active ? "#ffffff" : palette.color} />
      </mesh>

    </group>
  );
}

function RoadMesh({ from, to }) {
  const start = [...cityPos(from.x, from.z)];
  const end = [...cityPos(to.x, to.z)];
  start[1] = 0.02;
  end[1] = 0.02;
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const mid = [(start[0] + end[0]) / 2, 0.03, (start[2] + end[2]) / 2];

  return (
    <group position={mid} rotation={[0, -angle, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[length, 0.05, 1.85]} />
        <meshStandardMaterial color="#0a1019" emissive="#08111d" emissiveIntensity={0.06} roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[length * 0.82, 0.01, 0.06]} />
        <meshBasicMaterial color="#6dd7ff" transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, 0.031, 0.46]}>
        <boxGeometry args={[length * 0.82, 0.008, 0.018]} />
        <meshBasicMaterial color="#c7ecff" transparent opacity={0.16} />
      </mesh>
      <mesh position={[0, 0.031, -0.46]}>
        <boxGeometry args={[length * 0.82, 0.008, 0.018]} />
        <meshBasicMaterial color="#c7ecff" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <circleGeometry args={[20, 72]} />
        <meshStandardMaterial color="#060d16" emissive="#081320" emissiveIntensity={0.1} roughness={1} />
      </mesh>
      <gridHelper args={[36, 30, "#0ecfff", "#14304d"]} position={[0, 0.01, 0]} />
    </group>
  );
}

function TinyTree({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.44, 8]} />
        <meshStandardMaterial color="#4b3127" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#5d9b63" emissive="#2a5f34" emissiveIntensity={0.06} roughness={0.95} />
      </mesh>
    </group>
  );
}

function KidFigure({ position = [0, 0, 0], shirt = "#ffd166" }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.18, 10]} />
        <meshStandardMaterial color={shirt} emissive={shirt} emissiveIntensity={0.05} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.26, 0]} castShadow>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color="#f2c6a0" roughness={0.8} />
      </mesh>
      <mesh position={[-0.03, 0.02, 0]} castShadow rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.02, 0.12, 0.02]} />
        <meshStandardMaterial color="#93a4bd" roughness={0.9} />
      </mesh>
      <mesh position={[0.03, 0.02, 0]} castShadow rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.02, 0.12, 0.02]} />
        <meshStandardMaterial color="#93a4bd" roughness={0.9} />
      </mesh>
    </group>
  );
}

function DogFigure({ position = [0, 0, 0], color = "#c89a63" }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.18, 0.11, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh position={[0.12, 0.11, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.07]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh position={[-0.11, 0.12, 0.04]} rotation={[0, 0, 0.7]} castShadow>
        <boxGeometry args={[0.02, 0.1, 0.02]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      {[-0.05, 0.02, 0.09, 0.15].map((x, index) => (
        <mesh key={index} position={[x - 0.04, 0.02, index % 2 === 0 ? 0.025 : -0.025]} castShadow>
          <boxGeometry args={[0.02, 0.08, 0.02]} />
          <meshStandardMaterial color="#6f5235" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function SwingSet({ position = [0, 0, 0], accent = "#6dd7ff" }) {
  return (
    <group position={position}>
      <mesh position={[-0.18, 0.3, 0]} rotation={[0, 0, 0.24]} castShadow>
        <boxGeometry args={[0.03, 0.62, 0.03]} />
        <meshStandardMaterial color="#93a4bd" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0.18, 0.3, 0]} rotation={[0, 0, -0.24]} castShadow>
        <boxGeometry args={[0.03, 0.62, 0.03]} />
        <meshStandardMaterial color="#93a4bd" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.46, 0.04, 0.04]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.12} roughness={0.52} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <group key={x} position={[x, 0.38, 0]}>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.008, 0.18, 0.008]} />
            <meshStandardMaterial color="#d9e4f2" roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[0, -0.02, 0]} castShadow>
            <boxGeometry args={[0.09, 0.018, 0.03]} />
            <meshStandardMaterial color="#ff7ab6" emissive="#ff7ab6" emissiveIntensity={0.08} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DogShelter({ position = [0, 0, 0], accent = "#ff69b4" }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.24, 0.46]} />
        <meshStandardMaterial color="#182231" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.38, 0.22, 4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.08} roughness={0.74} />
      </mesh>
      <mesh position={[0, 0.12, 0.23]}>
        <planeGeometry args={[0.18, 0.14]} />
        <meshBasicMaterial color="#2b0f26" transparent opacity={0.75} />
      </mesh>
      <DogFigure position={[-0.12, 0, -0.02]} color="#b68552" />
      <DogFigure position={[0.16, 0, 0.04]} color="#d1d5db" />
    </group>
  );
}

function PocketPark({ position = [0, 0, 0], accent = "#6dd7ff" }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.2, 1.7]} />
        <meshStandardMaterial color="#122032" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.85, 1.35]} />
        <meshStandardMaterial color="#2d5136" emissive="#24492d" emissiveIntensity={0.08} roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.34, 24]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>
      <TinyTree position={[-0.68, 0, -0.42]} />
      <TinyTree position={[0.7, 0, -0.36]} scale={0.9} />
      <TinyTree position={[-0.62, 0, 0.46]} scale={0.95} />
      <SwingSet position={[0.54, 0.02, 0.24]} accent={accent} />
      <KidFigure position={[0.08, 0.02, -0.12]} shirt="#ffd166" />
      <KidFigure position={[-0.14, 0.02, 0.18]} shirt="#7dd3fc" />
      <DogFigure position={[0.32, 0.02, -0.26]} color="#d9a066" />
    </group>
  );
}

function CityLife({ artists }) {
  const parks = useMemo(() => {
    if (!artists.length) return [];
    const sorted = [...artists]
      .sort((a, b) => Math.hypot(a.x || 0, a.z || 0) - Math.hypot(b.x || 0, b.z || 0))
      .slice(0, Math.min(4, artists.length));

    return sorted.map((artist, index) => {
      const angle = Math.atan2(artist.z || 0, artist.x || 0) + (index % 2 === 0 ? 0.42 : -0.38);
      const radius = Math.max(1.8, Math.hypot(artist.x || 0, artist.z || 0) - 1.4);
      const accent = Object.values(GENRE_COLORS)[index % Object.values(GENRE_COLORS).length].color;
      return {
        key: `${artist.id}-park`,
        position: [Math.cos(angle) * radius * CITY_SCALE, 0.02, Math.sin(angle) * radius * CITY_SCALE],
        accent,
      };
    });
  }, [artists]);

  const shelter = useMemo(() => {
    if (!artists.length) return [0, 0.02, 0];
    const outer = [...artists]
      .sort((a, b) => Math.hypot(b.x || 0, b.z || 0) - Math.hypot(a.x || 0, a.z || 0))[0];
    const angle = Math.atan2(outer.z || 0, outer.x || 0) - 0.52;
    const radius = Math.hypot(outer.x || 0, outer.z || 0) + 1.8;
    return [Math.cos(angle) * radius * CITY_SCALE, 0.02, Math.sin(angle) * radius * CITY_SCALE];
  }, [artists]);

  return (
    <group>
      {parks.map((park) => (
        <PocketPark key={park.key} position={park.position} accent={park.accent} />
      ))}
      <DogShelter position={shelter} accent="#ff7ab6" />
      <DogFigure position={[shelter[0] + 0.92, 0.02, shelter[2] + 0.14]} color="#f0d4a4" />
      <KidFigure position={[shelter[0] - 0.8, 0.02, shelter[2] - 0.12]} shirt="#a8ff78" />
    </group>
  );
}

export default function CityScene({
  artists,
  roads,
  selectedArtist,
  hoveredArtist,
  onHover,
  onLeave,
  onSelect,
  beatPulse,
  timeMultiplier,
}) {
  const sceneArtists = useMemo(() => {
    if (artists.length) return artists;
    return Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      const radius = 2.8 + index * 0.28;
      return {
        id: `demo-${index}`,
        name: `Demo Artist ${index + 1}`,
        genre: Object.keys(GENRE_COLORS)[index % 6],
        plays: 30 + index * 8,
        followers: 200000 + index * 180000,
        popularity: 55 + index * 4,
        lastPlayed: 2 + index,
        energy: 0.45 + index * 0.05,
        danceability: 0.42 + index * 0.05,
        topTracks: [`Track ${index + 1}A`, `Track ${index + 1}B`, `Track ${index + 1}C`],
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    });
  }, [artists]);

  const effectiveRoads = roads && roads.length ? roads : [];

  const metrics = useMemo(() => ({
    maxPlays: Math.max(1, ...sceneArtists.map((artist) => artist.plays || 0)),
    maxFollowers: Math.max(1, ...sceneArtists.map((artist) => artist.followers || 0)),
    maxLastPlayed: Math.max(1, ...sceneArtists.map((artist) => artist.lastPlayed || 1)),
  }), [sceneArtists]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10 }}>
      <Canvas shadows dpr={[1, 1.75]}>
        <color attach="background" args={["#060610"]} />
        <fog attach="fog" args={["#060610", 18, 42]} />

        <PerspectiveCamera makeDefault position={[0, 12, 16]} fov={48} />
        <ambientLight intensity={0.52} color="#d7e7ff" />
        <hemisphereLight intensity={0.6} color="#d7f6ff" groundColor="#07121f" />
        <directionalLight
          castShadow
          intensity={1.25}
          color="#ffffff"
          position={[10, 18, 8]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight intensity={7} color="#00d8ff" position={[5, 12, 8]} distance={28} />
        <pointLight intensity={5.5} color="#ff4aa8" position={[-7, 8, -5]} distance={24} />

        <Stars radius={78} depth={32} count={1200} factor={3} saturation={0} fade speed={0.35} />

        <Ground />
        <CityLife artists={sceneArtists} />
        {effectiveRoads.map(([from, to], index) => (
          <RoadMesh key={`${from.id}-${to.id}-${index}`} from={from} to={to} />
        ))}
        {sceneArtists.map((artist) => (
          <BuildingMesh
            key={artist.id}
            artist={artist}
            metrics={metrics}
            selectedArtist={selectedArtist}
            hoveredArtist={hoveredArtist}
            onHover={onHover}
            onLeave={onLeave}
            onSelect={onSelect}
            beatPulse={beatPulse}
            timeMultiplier={timeMultiplier}
          />
        ))}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={8}
          maxDistance={24}
          minPolarAngle={0.68}
          maxPolarAngle={1.2}
          target={[0, 7, 0]}
        />
      </Canvas>
    </div>
  );
}

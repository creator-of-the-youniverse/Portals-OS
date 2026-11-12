// src/components/SphereImageGrid.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LaunchIconWrapper } from "./LaunchIconWrapper";
import "./SphereImageGrid.css";
import { AppId } from "../types";
import { Sparkles, User } from "lucide-react";
import { performanceMonitor, throttle } from "../lib/performanceUtils";

/**
 * SphereImageGrid - Interactive 3D App Icon Sphere
 *
 * This is a cleaned-up version of your original image sphere,
 * adapted to:
 *  - use app icons instead of image URLs
 *  - integrate with LaunchIconWrapper (warp → portal → open window)
 *
 * The 3D math, rotation, momentum, and layout logic
 * are the same as your original.
 */

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SphericalPosition {
  theta: number; // Azimuth angle in degrees
  phi: number; // Polar angle in degrees
  radius: number; // Distance from center
}

export interface WorldPosition extends Position3D {
  scale: number;
  zIndex: number;
  isVisible: boolean;
  fadeOpacity: number;
  originalIndex: number;
}

// App definition for the sphere (id + icon component)
export interface AppDefinition {
  id: AppId;
  name?: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
  color?: string;
  category?: string;
}

export interface SphereImageGridProps {
  apps?: AppDefinition[];
  onAppClick?: (appId: AppId, size?: { width: number; height: number }) => void;
  containerSize?: number;
  sphereRadius?: number;
  dragSensitivity?: number;
  momentumDecay?: number;
  maxRotationSpeed?: number;
  baseImageScale?: number;
  hoverScale?: number;
  perspective?: number;
  perspectiveOrigin?: string;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  className?: string;
}

interface RotationState {
  x: number;
  y: number;
  z: number;
}

interface VelocityState {
  x: number;
  y: number;
}

interface MousePosition {
  x: number;
  y: number;
}

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const SPHERE_MATH = {
  degreesToRadians: (degrees: number): number => degrees * (Math.PI / 80),
  radiansToDegrees: (radians: number): number => radians * (80 / Math.PI),

  sphericalToCartesian: (
    radius: number,
    theta: number,
    phi: number
  ): Position3D => ({
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }),

  calculateDistance: (
    pos: Position3D,
    center: Position3D = { x: 10, y: 10, z: 0 }
  ): number => {
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dz = pos.z - center.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  normalizeAngle: (angle: number): number => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  },
};

// ==========================================
// MAIN COMPONENT
// ==========================================

const SphereImageGrid: React.FC<SphereImageGridProps> = ({
  apps = [],
  onAppClick,
  containerSize = 500,
  sphereRadius = 1000,
  dragSensitivity = 0.3,
  momentumDecay = 0.985, // Slippery - natural roll to a crawl (was 0.95)
  maxRotationSpeed = 2,
  baseImageScale = 0.08,
  hoverScale = 2,
  perspective = 2000,
  perspectiveOrigin = "50% 50%",
  autoRotate = true,
  autoRotateSpeed = 0.2,
  className = "",
}) => {
  // ==========================================
  // STATE & REFS
  // ==========================================

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [rotation, setRotation] = useState<RotationState>({
    x: 0,
    y: 0,
    z: 0,
  });
  const [velocity, setVelocity] = useState<VelocityState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<MousePosition>({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);
  // ==========================================
  // Install CSS variables dynamically
  // (replaces inline width/height/perspective)
  // ==========================================
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.style.setProperty(
      "--sig-container-size",
      `${containerSize}px`
    );

    containerRef.current.style.setProperty(
      "--sig-perspective",
      `${perspective}px`
    );

    if (perspectiveOrigin) {
      containerRef.current.style.setProperty(
        "--sig-perspective-origin",
        perspectiveOrigin
      );
    }
  }, [containerSize, perspective, perspectiveOrigin]);
  // ==========================================
  // COMPUTED VALUES
  // ==========================================

  const actualSphereRadius = sphereRadius || containerSize * 0.3;
  const baseImageSize = containerSize * baseImageScale;

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  const generateSpherePositions = useCallback((): SphericalPosition[] => {
    const positions: SphericalPosition[] = [];

    if (apps.length === 1) {
      return [{
        theta: 0,
        phi: 90,
        radius: actualSphereRadius
      }];
    }

    // Sort apps alphabetically by ID (A-Z)
    const sortedApps = [...apps].sort((a, b) => {
      const aId = a.id.toLowerCase();
      const bId = b.id.toLowerCase();
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    });

    const imageCount = sortedApps.length;

    // Distribute apps evenly across the full sphere surface
    // Use Fibonacci sphere distribution for optimal 3D spacing
    for (let i = 0; i < imageCount; i++) {
      // Fibonacci sphere algorithm for even distribution
      const t = i / (imageCount - 1); // 0 to 1
      const inclination = Math.acos(1 - 2 * t); // phi angle
      const azimuth = Math.PI * (2 + Math.sqrt(3)) * i; // golden angle

      // Convert to degrees and adjust range
      let phi = (inclination * 180) / Math.PI; // 0° to 180°
      let theta = (azimuth * 180) / Math.PI; // 0° to many rotations

      // Adjust phi range for better visibility (avoid extreme poles)
      phi = 10 + (phi / 80) * 60; // 20° to 160° range

      // Normalize theta to 0-360°
      theta = theta % 900;

      positions.push({
        theta,
        phi,
        radius: actualSphereRadius,
      });
    }

    return positions;
  }, [apps, actualSphereRadius]);

  const imagePositions = useMemo(() => generateSpherePositions(), [generateSpherePositions]);

  const calculateWorldPositions = useCallback((): WorldPosition[] => {
    // Early return if no positions
    if (imagePositions.length === 0) return [];

    const positions = imagePositions.map((pos, index) => {
      const thetaRad = SPHERE_MATH.degreesToRadians(pos.theta);
      const phiRad = SPHERE_MATH.degreesToRadians(pos.phi);
      const rotXRad = SPHERE_MATH.degreesToRadians(rotation.x);
      const rotYRad = SPHERE_MATH.degreesToRadians(rotation.y);

      let x = pos.radius * Math.sin(phiRad) * Math.cos(thetaRad);
      let y = pos.radius * Math.cos(phiRad);
      let z = pos.radius * Math.sin(phiRad) * Math.sin(thetaRad) * 1.5;

      const x1 = x * Math.cos(rotYRad) + z * Math.sin(rotYRad);
      const z1 = -x * Math.sin(rotYRad) + z * Math.cos(rotYRad);
      x = x1;
      z = z1;

      const y2 = y * Math.cos(rotXRad) - z * Math.sin(rotXRad);
      const z2 = y * Math.sin(rotXRad) + z * Math.cos(rotXRad);
      y = y2;
      z = z2;

      const worldPos: Position3D = { x, y, z };

      const fadeZoneStart = 0; // Start fading exactly as they cross into the portal
      const fadeZoneEnd = -actualSphereRadius * 0.15; // Fully disappear shortly after crossing
      const isVisible = worldPos.z > fadeZoneEnd;

      let fadeOpacity = 1;
      if (worldPos.z <= fadeZoneStart) {
        fadeOpacity = Math.max(
          0, // Allow them to become completely invisible to improve performance
          (worldPos.z - fadeZoneEnd) / (fadeZoneStart - fadeZoneEnd)
        );
      }

      const isPoleImage = pos.phi < 60 || pos.phi > 140;

      const distanceFromCenter = Math.sqrt(
        worldPos.x * worldPos.x + worldPos.y * worldPos.y
      );
      const maxDistance = actualSphereRadius;
      const distanceRatio = Math.min(distanceFromCenter / maxDistance, 1);

      const distancePenalty = isPoleImage ? 1 : 0.7;
      const centerScale = Math.max(0.2, 1 - distanceRatio * distancePenalty);

      // Deep perspective scaling
      const zScale = (worldPos.z + actualSphereRadius) / (actualSphereRadius * 3);
      const scale = centerScale * (0.8 + zScale * 2.2);

      return {
        ...worldPos,
        scale,
        zIndex: Math.round(1000 + worldPos.z),
        isVisible,
        fadeOpacity,
        originalIndex: index,
      };
    });

    // Skip O(N^2) collision pass for large Fibonacci constellations (> 48 nodes)
    // as Fibonacci distribution already spaces them evenly and O(N^2) per frame stalls React.
    if (positions.length > 48) {
      return positions;
    }

    // Simplified collision detection - only check nearby items
    const adjustedPositions = [...positions];
    const visiblePositions = positions.filter(pos => pos.isVisible);

    for (let i = 0; i < adjustedPositions.length; i++) {
      const pos = adjustedPositions[i];
      if (!pos.isVisible) continue;

      let adjustedScale = pos.scale;
      const imageSize = baseImageSize * adjustedScale;

      // Only check collision with nearby visible items (optimization)
      for (let j = 0; j < visiblePositions.length; j++) {
        const other = visiblePositions[j];
        if (pos.originalIndex === other.originalIndex) continue;

        // Skip if too far apart to collide
        const dx = pos.x - other.x;
        const dy = pos.y - other.y;
        const distanceSquared = dx * dx + dy * dy;
        const maxCheckDistance = (imageSize + baseImageSize * other.scale) / 2 + 50;

        if (distanceSquared > maxCheckDistance * maxCheckDistance) continue;

        const otherSize = baseImageSize * other.scale;
        const distance = Math.sqrt(distanceSquared);

        const minDistance = (imageSize + otherSize) / 2 + 25;

        if (distance < minDistance && distance > 0) {
          const overlap = minDistance - distance;
          const reductionFactor = Math.max(
            0.4,
            1 - (overlap / minDistance) * 0.4
          );
          adjustedScale = Math.min(
            adjustedScale,
            adjustedScale * reductionFactor
          );
        }
      }

      adjustedPositions[i] = {
        ...pos,
        scale: Math.max(0.25, adjustedScale),
      };
    }

    return adjustedPositions;
  }, [imagePositions, rotation, actualSphereRadius, baseImageSize]);

  const clampRotationSpeed = useCallback(
    (speed: number): number =>
      Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, speed)),
    [maxRotationSpeed]
  );

  // ==========================================
  // PHYSICS & MOMENTUM
  // ==========================================

  const updateMomentum = useCallback(() => {
    if (isDragging) return;

    setVelocity((prev) => {
      const newVelocity = {
        x: prev.x * momentumDecay,
        y: prev.y * momentumDecay,
      };

      if (
        !autoRotate &&
        Math.abs(newVelocity.x) < 0.01 &&
        Math.abs(newVelocity.y) < 0.01
      ) {
        return { x: 0, y: 0 };
      }

      return newVelocity;
    });

    setRotation((prev) => {
      let newY = prev.y;

      if (autoRotate) {
        newY += autoRotateSpeed;
      }

      newY += clampRotationSpeed(velocity.y);

      return {
        x: SPHERE_MATH.normalizeAngle(prev.x + clampRotationSpeed(velocity.x)),
        y: SPHERE_MATH.normalizeAngle(newY),
        z: prev.z,
      };
    });
  }, [
    isDragging,
    momentumDecay,
    velocity,
    clampRotationSpeed,
    autoRotate,
    autoRotateSpeed,
  ]);

  // Throttled version of updateMomentum to improve performance
  const throttledUpdateMomentum = useCallback(() => {
    updateMomentum();
  }, [updateMomentum]);

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setVelocity({ x: 0, y: 0 });
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    throttle((e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;

      const rotationDelta = {
        x: -deltaY * dragSensitivity,
        y: deltaX * dragSensitivity,
      };

      setRotation((prev) => ({
        x: SPHERE_MATH.normalizeAngle(
          prev.x + clampRotationSpeed(rotationDelta.x)
        ),
        y: SPHERE_MATH.normalizeAngle(
          prev.y + clampRotationSpeed(rotationDelta.y)
        ),
        z: prev.z,
      }));

      setVelocity({
        x: clampRotationSpeed(rotationDelta.x),
        y: clampRotationSpeed(rotationDelta.y),
      });

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }, 16), // ~60fps throttling
    [isDragging, dragSensitivity, clampRotationSpeed]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);
    setVelocity({ x: 0, y: 0 });
    lastMousePos.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const touch = e.touches[0];
      const deltaX = touch.clientX - lastMousePos.current.x;
      const deltaY = touch.clientY - lastMousePos.current.y;

      const rotationDelta = {
        x: -deltaY * dragSensitivity,
        y: deltaX * dragSensitivity,
      };

      setRotation((prev) => ({
        x: SPHERE_MATH.normalizeAngle(
          prev.x + clampRotationSpeed(rotationDelta.x)
        ),
        y: SPHERE_MATH.normalizeAngle(
          prev.y + clampRotationSpeed(rotationDelta.y)
        ),
        z: prev.z,
      }));

      setVelocity({
        x: clampRotationSpeed(rotationDelta.x),
        y: clampRotationSpeed(rotationDelta.y),
      });

      lastMousePos.current = { x: touch.clientX, y: touch.clientY };
    },
    [isDragging, dragSensitivity, clampRotationSpeed]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ==========================================
  // EFFECTS & LIFECYCLE
  // ==========================================

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let lastTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      // Only animate if there's movement or auto-rotation is active
      const hasVelocity = Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01;
      const shouldAnimate = autoRotate || hasVelocity || isDragging;

      if (shouldAnimate && currentTime - lastTime >= frameInterval) {
        updateMomentum();
        lastTime = currentTime;
      }

      // Continue animation loop if needed, otherwise stop
      if (shouldAnimate) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        animationFrame.current = null;
      }
    };

    if (isMounted) {
      animationFrame.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [isMounted, updateMomentum, autoRotate, velocity.x, velocity.y, isDragging]);

  useEffect(() => {
    if (!isMounted) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isMounted,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  const worldPositions = calculateWorldPositions();

  // Compute the *actual* center of the sphere container in screen coords
  const getPortalCenter = useCallback(() => {
    // Always warp to the center of the screen (portal center)
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }, []);

  const portalCenter = getPortalCenter();
  
  // Extract perspective origin for parallax calculation
  const originPct = useMemo(() => {
    let xPct = 0.5;
    let yPct = 0.5;
    if (perspectiveOrigin) {
      const [xStr, yStr] = perspectiveOrigin.split(" ");
      xPct = parseFloat(xStr) / 100;
      yPct = parseFloat(yStr) / 100;
    }
    return { xPct: isNaN(xPct) ? 0.5 : xPct, yPct: isNaN(yPct) ? 0.5 : yPct };
  }, [perspectiveOrigin]);

  const renderIconNode = useCallback(
    (app: AppDefinition, index: number) => {
      const position = worldPositions[index];
      if (!position || !position.isVisible) return null;

      let imageSize = baseImageSize * position.scale;
      imageSize = Math.max(40, Math.min(imageSize, 140));
      const isHovered = hoveredIndex === index;
      const finalScale = isHovered
        ? Math.min(hoverScale, hoverScale / position.scale)
        : 1;

      // Compute parallax shift to simulate 3D perspective vanishing point.
      // Normalized Z from -1 (far, inside portal) to 1 (close, popping out).
      const normalizedZ = position.z / actualSphereRadius; 
      
      // We want the "far center" to stay fixed (shift=0), and only the "close center" to shift.
      // depthFactor is 0 at far back (z = -1) and 1 at front (z = 1).
      // Wait, earlier we found pos.z > 0 is close! So z=-1 is far.
      const depthFactor = (normalizedZ + 1) / 2;
      
      const parallaxIntensity = 300; // Max pixels of shift at the very front
      const shiftX = - (originPct.xPct - 0.5) * parallaxIntensity * depthFactor;
      const shiftY = - (originPct.yPct - 0.5) * parallaxIntensity * depthFactor;

      return (
        <LaunchIconWrapper
          key={`${app.id}-${index}`}
          onLaunchComplete={() => onAppClick?.(app.id as AppId)}
          warpTarget={portalCenter}
          style={{
            position: "absolute",
            width: `${imageSize}px`,
            height: `${imageSize}px`,
            left: "50%",
            top: "50%",
            opacity: position.fadeOpacity ?? 1,
            transform: `translate3d(${position.x + shiftX}px, ${position.y + shiftY}px, ${position.z}px) translate(-50%, -50%) scale(${finalScale})`,
            zIndex: position.zIndex ?? 0,
            cursor: "pointer",
          }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Instant Tooltip */}
          {isHovered && (
            <div 
              className="absolute top-full left-1/2 -translate-x-1/2 mt-4 px-3 py-1.5 bg-black/90 border border-white/20 rounded-lg text-white font-bold text-[10px] tracking-widest whitespace-nowrap shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none"
              style={{
                // Reverse the scale so tooltip text isn't huge or tiny, bounded to keep it readable
                transform: `translateX(-50%) scale(${1 / Math.max(0.5, finalScale)})`,
                zIndex: 999999
              }}
            >
              {app.name}
            </div>
          )}
          {/* Constellation LOD: Show a star for extremely distant nodes, otherwise icon */}
          {position.scale > 0.05 ? (
            typeof app.icon === 'string' ? (
              <div className="w-full h-full flex items-center justify-center rounded-full bg-white/5 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                <User
                  className="w-1/2 h-1/2"
                  style={{ color: app.color || 'white', filter: `drop-shadow(0 0 5px ${app.color || 'white'})` }}
                />
              </div>
            ) : (
              app.icon && <app.icon className="w-full h-full" />
            )
          ) : (
            <div
              className="w-2 h-2 rounded-full sig-star-node shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              style={{ backgroundColor: app.color || 'white' }}
            />
          )}
        </LaunchIconWrapper>
      );
    },
    [
      worldPositions,
      baseImageSize,
      containerSize,
      hoveredIndex,
      hoverScale,
      onAppClick,
      portalCenter,
    ]
  );

  // ==========================================
  // EARLY RETURNS
  // ==========================================

  if (!isMounted) {
    return (
      <div className="sig-loading-container">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!apps.length) {
    return (
      <div className="sig-empty-container">
        {/* No apps yet; render nothing visible */}
      </div>
    );
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================

  // Sort apps to match the sphere positions
  const sortedApps = [...apps].sort((a, b) => {
    const aId = a.id.toLowerCase();
    const bId = b.id.toLowerCase();
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });

  return (
    <div ref={containerRef} className={`sig-root-container ${className}`}>
      <div className="sig-inner-wrapper">
        <div
          className="sphere-image-grid"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {worldPositions.map((pos, index) =>
            renderIconNode(sortedApps[index], index)
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(SphereImageGrid);

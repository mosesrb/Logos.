import React, { useRef, useState, useEffect } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

export const Spotlight = ({ 
  children, 
  className = "", 
  fill = "var(--solaris-glow)", 
  radius = 350 
}) => {
  const containerRef = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={{ position: 'relative' }}>
      <motion.div
        className="pointer-events-none absolute -inset-px z-30 transition duration-300"
        style={{
          position: 'absolute',
          inset: '-1px',
          zIndex: 30,
          background: `radial-gradient(${radius}px circle at ${x}px ${y}px, ${fill}, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
};

export default Spotlight;

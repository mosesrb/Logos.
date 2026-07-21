import React from 'react';
import { motion } from 'framer-motion';

export const BorderBeam = ({ 
  className = "", 
  size = 200, 
  duration = 15, 
  colorFrom = "var(--solaris-accent)", 
  colorTo = "var(--solaris-gold)" 
}) => {
  return (
    <div
      style={{
        "--size": `${size}px`,
        "--duration": `${duration}s`,
        "--color-from": colorFrom,
        "--color-to": colorTo,
        "--delay": "0s",
      }}
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] [mask-image:linear-gradient(transparent,black)] ${className}`}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: "var(--size)",
          background: "linear-gradient(to right, var(--color-from), var(--color-to), transparent)",
          offsetPath: "rect(0 auto auto 0 round var(--size))",
        }}
        animate={{
          offsetDistance: ["0%", "100%"],
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
};

export default BorderBeam;

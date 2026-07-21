import React from 'react';
import { motion } from 'framer-motion';

/**
 * SolarisIcon - Motion-First Glyph System
 * Inspired by itshover design principles.
 * 
 * Aesthetic: Void & Gold, Technical, Precision.
 * Animations: Smooth, intentional, motion-triggered.
 */

const iconVariants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { 
    pathLength: 1, 
    opacity: 1,
    transition: { 
      pathLength: { type: "spring", duration: 1.5, bounce: 0 },
      opacity: { duration: 0.5 }
    }
  },
  hover: {
    scale: 1.15,
    stroke: "var(--solaris-accent)",
    filter: "drop-shadow(0 0 12px var(--solaris-glow))",
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 15 
    }
  }
};

const SolarisIcon = ({ icon, className = "", size = 20, ...props }) => {
  const paths = {
    settings: (
      <motion.path 
        d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
        variants={{
          ...iconVariants,
          hover: { ...iconVariants.hover, rotate: 90 }
        }}
      />
    ),
    chat: (
      <motion.path 
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        variants={iconVariants}
      />
    ),
    agent: (
      <motion.path 
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        variants={iconVariants}
      />
    ),
    terminal: (
      <motion.path 
        d="M8 9l3 3-3 3m5 0h3"
        variants={{
          ...iconVariants,
          hover: { ...iconVariants.hover, x: [0, 2, 0], transition: { repeat: Infinity, duration: 0.5 } }
        }}
      />
    ),
    metrics: (
      <motion.path 
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        variants={iconVariants}
      />
    ),
    database: (
      <motion.path 
        d="M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7m0 5c0 1.657-3.582 3-8 3s-8-1.343-8-3M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7s3.582-3 8-3 8 1.343 8 3"
        variants={iconVariants}
      />
    ),
    neural: (
      <motion.path 
        d="M13 10V3L4 14h7v7l9-11h-7z"
        variants={{
          ...iconVariants,
          hover: { ...iconVariants.hover, scale: 1.2, stroke: "#FFD700" }
        }}
      />
    ),
    persona: (
      <motion.path 
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        variants={iconVariants}
      />
    ),
    scenario: (
      <motion.path 
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
        variants={iconVariants}
      />
    ),
    user: (
      <motion.path 
        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        variants={iconVariants}
      />
    ),
    evaluation: (
      <motion.path 
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        variants={iconVariants}
      />
    ),
    close: (
      <motion.path 
        d="M6 18L18 6M6 6l12 12"
        variants={iconVariants}
      />
    ),
    minimize: (
      <motion.path 
        d="M20 12H4"
        variants={iconVariants}
      />
    ),
    maximize: (
      <motion.path 
        d="M4 4h16v16H4z"
        variants={iconVariants}
      />
    ),
    more: (
      <motion.path 
        d="M12 5v.01M12 12v.01M12 19v.01"
        variants={iconVariants}
      />
    ),
    send: (
      <motion.path 
        d="M10 14l11-11m0 0l-7 21-3-9-9-3 21-7z"
        variants={{
          ...iconVariants,
          hover: { ...iconVariants.hover, x: 2, y: -2 }
        }}
      />
    ),
    refresh: (
      <motion.path 
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        variants={{
          ...iconVariants,
          hover: { ...iconVariants.hover, rotate: 360, transition: { duration: 0.8 } }
        }}
      />
    ),
    search: (
      <motion.path 
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        variants={iconVariants}
      />
    ),
    trash: (
      <motion.path 
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        variants={iconVariants}
      />
    ),
    tool: (
      <motion.path 
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.77 3.77z"
        variants={iconVariants}
      />
    ),
    alert: (
      <motion.path 
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 17c-.77 1.333.192 3 1.732 3z"
        variants={iconVariants}
      />
    ),
    play: (
      <motion.path 
        d="M5 3l14 9-14 9V3z"
        variants={iconVariants}
      />
    ),
    lock: (
      <motion.path 
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        variants={iconVariants}
      />
    ),
    web: (
      <motion.path 
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        variants={iconVariants}
      />
    ),
    data: (
      <motion.path 
        d="M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7m0 5c0 1.657-3.582 3-8 3s-8-1.343-8-3M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7s3.582-3 8-3 8 1.343 8 3"
        variants={iconVariants}
      />
    ),
    plus: (
      <motion.path 
        d="M12 4v16m8-8H4"
        variants={iconVariants}
      />
    )
  };

  const currentIcon = paths[icon] || paths.settings;

  return (
    <motion.svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none"
      stroke="var(--solaris-gold)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`solaris-icon ${className}`}
      initial="initial"
      animate="animate"
      whileHover="hover"
      {...props}
    >
      {currentIcon}
    </motion.svg>
  );
};

export default SolarisIcon;

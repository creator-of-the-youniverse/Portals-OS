import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCoreApps } from '../apps.config';
import { useKernel } from '../store/kernel';
import { AppId } from '../types';

/**
 * StartMenuCircle - Circular app menu that pops from the bottom-left speed bump
 * Shows the 6 core app icons in a circular arrangement
 */

interface StartMenuCircleProps {
    isOpen: boolean;
    onClose: () => void;
    onAppClick: (appId: AppId) => void;
}

const BUTTON_SIZE = 48;
const CIRCLE_RADIUS = typeof window !== 'undefined' && window.innerWidth < 768 ? 140 : 220;

const StartMenuCircle: React.FC<StartMenuCircleProps> = ({
    isOpen,
    onClose,
    onAppClick,
}) => {
    const projectFolders = useKernel((state) => state.projectFolders);
    const weavedWidgets = useKernel((state) => state.weavedWidgets);
    
    // Get core apps (and weaved widgets) but exclude oracle (handled separately)
    const apps = getCoreApps(projectFolders, weavedWidgets)
      .filter(app => app.id !== 'oracle')
      .slice(0, 15); // Show more than just 7 if there are widgets

    // Calculate position for each icon in a semicircle quadrant
    const getIconPosition = (index: number, total: number) => {
        // Arc from 15° to 75° for a nice fan out
        const startAngle = 15;
        const endAngle = 75;
        const angleRange = endAngle - startAngle;
        const angle = startAngle + (angleRange / (total - 1)) * index;
        const radians = (angle * Math.PI) / 180;

        return {
            x: Math.cos(radians) * CIRCLE_RADIUS,
            y: -Math.sin(radians) * CIRCLE_RADIUS, // Negative because Y grows downward
        };
    };

    // The start menu speed bump is at the bottom-left corner. Let's start the animation from there.
    // Center of the tucked button is at x: 8, y: 8 from bottom-left corner.
    const originPoint = { x: 8, y: -8 };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop to close menu */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40"
                        onClick={onClose}
                    />

                    {/* App icons in circle */}
                    <div
                        className="fixed z-50"
                        style={{
                            bottom: 0,
                            left: 0
                        }}
                    >
                        {apps.map((app, index) => {
                            const position = getIconPosition(index, apps.length);
                            const Icon = app.icon;

                            return (
                                <motion.button
                                    key={app.id}
                                    initial={{
                                        x: originPoint.x,
                                        y: originPoint.y,
                                        opacity: 0,
                                        scale: 0
                                    }}
                                    animate={{
                                        x: position.x,
                                        y: position.y,
                                        opacity: 1,
                                        scale: 1
                                    }}
                                    exit={{
                                        x: originPoint.x,
                                        y: originPoint.y,
                                        opacity: 0,
                                        scale: 0
                                    }}
                                    transition={{
                                        type: 'spring',
                                        stiffness: 400,
                                        damping: 25,
                                        delay: index * 0.05,
                                    }}
                                    onClick={() => {
                                        onAppClick(app.id);
                                        onClose();
                                    }}
                                    className="absolute flex items-center justify-center cursor-pointer group"
                                    style={{
                                        width: BUTTON_SIZE,
                                        height: BUTTON_SIZE,
                                        marginLeft: -BUTTON_SIZE / 2,
                                        marginTop: -BUTTON_SIZE / 2,
                                    }}
                                    title={app.name}
                                >
                                    {/* Background circle */}
                                    <div
                                        className="absolute inset-0 rounded-full border-2 border-white/30 shadow-lg group-hover:border-purple-400/60 transition-colors"
                                        style={{
                                            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
                                        }}
                                    />

                                    {/* Icon */}
                                    {Icon && (
                                        <Icon className="relative z-10 w-5 h-5 text-white group-hover:text-purple-300 transition-colors" />
                                    )}

                                    {/* Label on hover */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        whileHover={{ opacity: 1, y: 0 }}
                                        className="absolute top-full mt-1 px-2 py-0.5 bg-black/80 rounded text-xs text-white whitespace-nowrap pointer-events-none"
                                    >
                                        {app.name}
                                    </motion.div>
                                </motion.button>
                            );
                        })}
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default StartMenuCircle;

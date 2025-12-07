/**
 * Original Vehicle SVG Templates from DispatchConsole
 * These are the exact SVG icons used in the old system
 * Car (sedan) and Van (wheelchair van) with dynamic status colors
 */

/**
 * PREMIUM Status colors - Rich, sophisticated gradients
 * Each status has a primary and secondary color for gradient effects
 */
export const STATUS_COLORS = {
  AVAILABLE: '#10B981',      // Emerald green - premium
  BUSY: '#EF4444',           // Rose red - premium
  AWAY: '#F59E0B',           // Amber - premium  
  CLEARING: '#3B82F6',       // Royal blue - premium
  OFFLINE: '#6B7280',        // Cool gray - premium
} as const;

// Premium gradient pairs for richer appearance
export const STATUS_GRADIENTS = {
  AVAILABLE: { primary: '#10B981', secondary: '#059669', highlight: '#34D399' },  // Emerald
  BUSY: { primary: '#EF4444', secondary: '#DC2626', highlight: '#F87171' },       // Rose
  AWAY: { primary: '#F59E0B', secondary: '#D97706', highlight: '#FBBF24' },       // Amber
  CLEARING: { primary: '#3B82F6', secondary: '#2563EB', highlight: '#60A5FA' },   // Blue
  OFFLINE: { primary: '#6B7280', secondary: '#4B5563', highlight: '#9CA3AF' },    // Gray
} as const;

/**
 * Get status color from driver status string
 */
export const getStatusColor = (status?: string | null): string => {
  if (!status) return STATUS_COLORS.OFFLINE;
  
  const normalized = status.toUpperCase().trim();
  
  if (normalized.includes('AVAIL') || normalized.includes('FREE') || normalized === 'ONLINE') {
    return STATUS_COLORS.AVAILABLE;
  }
  if (normalized.includes('BUSY') || normalized.includes('ACTIVE') || normalized.includes('JOB')) {
    return STATUS_COLORS.BUSY;
  }
  if (normalized.includes('AWAY') || normalized.includes('BREAK') || normalized.includes('PAUSE')) {
    return STATUS_COLORS.AWAY;
  }
  if (normalized.includes('CLEAR') || normalized.includes('FINISH') || normalized.includes('PICK')) {
    return STATUS_COLORS.CLEARING;
  }
  
  return STATUS_COLORS.OFFLINE;
};

/**
 * Get gradient colors for premium appearance
 */
export const getStatusGradient = (status?: string | null) => {
  if (!status) return STATUS_GRADIENTS.OFFLINE;
  
  const normalized = status.toUpperCase().trim();
  
  if (normalized.includes('AVAIL') || normalized.includes('FREE') || normalized === 'ONLINE') {
    return STATUS_GRADIENTS.AVAILABLE;
  }
  if (normalized.includes('BUSY') || normalized.includes('ACTIVE') || normalized.includes('JOB')) {
    return STATUS_GRADIENTS.BUSY;
  }
  if (normalized.includes('AWAY') || normalized.includes('BREAK') || normalized.includes('PAUSE')) {
    return STATUS_GRADIENTS.AWAY;
  }
  if (normalized.includes('CLEAR') || normalized.includes('FINISH') || normalized.includes('PICK')) {
    return STATUS_GRADIENTS.CLEARING;
  }
  
  return STATUS_GRADIENTS.OFFLINE;
};

/**
 * CAR SVG Template (Sedan/Saloon) - Premium version with gradients
 * Modern, sleek design with gradient fills for professional appearance
 */
export const getCarSvg = (primaryColor: string, secondaryColor: string, highlightColor: string, vehicleNumber = 'car'): string => {
  const id = vehicleNumber.replaceAll(/[^a-zA-Z0-9]/g, '');
  return `<svg width="60" height="30" viewBox="0 0 120 60" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <!-- Premium body gradient -->
        <linearGradient id="bodyGrad-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${highlightColor}"/>
            <stop offset="40%" stop-color="${primaryColor}"/>
            <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
        <!-- Metallic shine -->
        <linearGradient id="shine-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="white" stop-opacity="0.4"/>
            <stop offset="50%" stop-color="white" stop-opacity="0"/>
            <stop offset="100%" stop-color="black" stop-opacity="0.2"/>
        </linearGradient>
        <!-- Window gradient -->
        <linearGradient id="windowGrad-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#87CEEB"/>
            <stop offset="100%" stop-color="#1E3A5F"/>
        </linearGradient>
        <!-- Wheel gradient -->
        <radialGradient id="wheelGrad-${id}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#4a4a4a"/>
            <stop offset="70%" stop-color="#1a1a1a"/>
            <stop offset="100%" stop-color="#000"/>
        </radialGradient>
    </defs>
    <g stroke="none" stroke-width="1" fill="none">
        <!-- Shadow -->
        <ellipse cx="60" cy="56" rx="50" ry="4" fill="rgba(0,0,0,0.2)"/>
        
        <!-- Car body - main shape -->
        <path d="M10,35 L15,25 L25,18 L45,15 L75,15 L95,18 L105,25 L110,35 L110,45 L10,45 Z" 
              fill="url(#bodyGrad-${id})" stroke="${secondaryColor}" stroke-width="1"/>
        
        <!-- Roof -->
        <path d="M30,18 L35,8 L85,8 L90,18 Z" 
              fill="url(#bodyGrad-${id})" stroke="${secondaryColor}" stroke-width="0.5"/>
        
        <!-- Metallic shine overlay -->
        <path d="M10,35 L15,25 L25,18 L45,15 L75,15 L95,18 L105,25 L110,35 L110,38 L10,38 Z" 
              fill="url(#shine-${id})"/>
        
        <!-- Front windshield -->
        <path d="M88,17 L92,24 L92,32 L72,32 L72,17 Z" 
              fill="url(#windowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        
        <!-- Rear windshield -->
        <path d="M32,17 L28,24 L28,32 L48,32 L48,17 Z" 
              fill="url(#windowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        
        <!-- Side windows -->
        <rect x="50" y="17" width="20" height="15" rx="1" 
              fill="url(#windowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        
        <!-- Front wheel -->
        <circle cx="88" cy="45" r="10" fill="url(#wheelGrad-${id})" stroke="#333" stroke-width="1"/>
        <circle cx="88" cy="45" r="5" fill="#666"/>
        <circle cx="88" cy="45" r="2" fill="#999"/>
        
        <!-- Rear wheel -->
        <circle cx="32" cy="45" r="10" fill="url(#wheelGrad-${id})" stroke="#333" stroke-width="1"/>
        <circle cx="32" cy="45" r="5" fill="#666"/>
        <circle cx="32" cy="45" r="2" fill="#999"/>
        
        <!-- Headlights -->
        <ellipse cx="107" cy="32" rx="3" ry="5" fill="#FFFACD" stroke="#ddd" stroke-width="0.5"/>
        
        <!-- Taillights -->
        <ellipse cx="13" cy="32" rx="3" ry="5" fill="#DC143C" stroke="#8B0000" stroke-width="0.5"/>
        
        <!-- Chrome trim line -->
        <line x1="15" y1="38" x2="105" y2="38" stroke="#C0C0C0" stroke-width="1" opacity="0.8"/>
        
        <!-- Door handle -->
        <rect x="55" y="34" width="8" height="2" rx="1" fill="#C0C0C0"/>
    </g>
</svg>`;
};

/**
 * VAN SVG Template (Wheelchair Van) - Premium version with gradients
 */
export const getVanSvg = (primaryColor: string, secondaryColor: string, highlightColor: string, vehicleNumber = 'van'): string => {
  const id = vehicleNumber.replaceAll(/[^a-zA-Z0-9]/g, '');
  return `<svg width="60" height="30" viewBox="0 0 120 60" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <!-- Premium body gradient -->
        <linearGradient id="vanBodyGrad-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${highlightColor}"/>
            <stop offset="40%" stop-color="${primaryColor}"/>
            <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
        <!-- Metallic shine -->
        <linearGradient id="vanShine-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="white" stop-opacity="0.4"/>
            <stop offset="50%" stop-color="white" stop-opacity="0"/>
            <stop offset="100%" stop-color="black" stop-opacity="0.2"/>
        </linearGradient>
        <!-- Window gradient -->
        <linearGradient id="vanWindowGrad-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#87CEEB"/>
            <stop offset="100%" stop-color="#1E3A5F"/>
        </linearGradient>
        <!-- Wheel gradient -->
        <radialGradient id="vanWheelGrad-${id}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#4a4a4a"/>
            <stop offset="70%" stop-color="#1a1a1a"/>
            <stop offset="100%" stop-color="#000"/>
        </radialGradient>
    </defs>
    <g stroke="none" stroke-width="1" fill="none">
        <!-- Shadow -->
        <ellipse cx="60" cy="56" rx="52" ry="4" fill="rgba(0,0,0,0.2)"/>
        
        <!-- Van body - main shape (taller, boxier) -->
        <path d="M8,42 L8,18 L18,10 L102,10 L110,18 L112,42 L112,48 L8,48 Z" 
              fill="url(#vanBodyGrad-${id})" stroke="${secondaryColor}" stroke-width="1"/>
        
        <!-- Metallic shine overlay -->
        <path d="M8,42 L8,18 L18,10 L102,10 L110,18 L112,35 L8,35 Z" 
              fill="url(#vanShine-${id})"/>
        
        <!-- Front windshield (larger for van) -->
        <path d="M98,12 L108,18 L108,38 L78,38 L78,12 Z" 
              fill="url(#vanWindowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        
        <!-- Side windows (multiple panels) -->
        <rect x="50" y="12" width="25" height="26" rx="1" 
              fill="url(#vanWindowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        <rect x="22" y="12" width="25" height="26" rx="1" 
              fill="url(#vanWindowGrad-${id})" stroke="#1a1a1a" stroke-width="0.5"/>
        
        <!-- Rear section (solid for van) -->
        <rect x="10" y="12" width="10" height="26" 
              fill="url(#vanBodyGrad-${id})" stroke="${secondaryColor}" stroke-width="0.5"/>
        
        <!-- Front wheel -->
        <circle cx="92" cy="48" r="10" fill="url(#vanWheelGrad-${id})" stroke="#333" stroke-width="1"/>
        <circle cx="92" cy="48" r="5" fill="#666"/>
        <circle cx="92" cy="48" r="2" fill="#999"/>
        
        <!-- Rear wheel -->
        <circle cx="28" cy="48" r="10" fill="url(#vanWheelGrad-${id})" stroke="#333" stroke-width="1"/>
        <circle cx="28" cy="48" r="5" fill="#666"/>
        <circle cx="28" cy="48" r="2" fill="#999"/>
        
        <!-- Headlights -->
        <rect x="108" y="25" rx="1" width="4" height="10" fill="#FFFACD" stroke="#ddd" stroke-width="0.5"/>
        
        <!-- Taillights -->
        <rect x="8" y="25" rx="1" width="4" height="10" fill="#DC143C" stroke="#8B0000" stroke-width="0.5"/>
        
        <!-- Chrome trim line -->
        <line x1="10" y1="40" x2="110" y2="40" stroke="#C0C0C0" stroke-width="1" opacity="0.8"/>
        
        <!-- Sliding door handle -->
        <rect x="35" y="32" width="10" height="2" rx="1" fill="#C0C0C0"/>
        
        <!-- Wheelchair symbol (subtle) -->
        <circle cx="16" cy="25" r="5" fill="none" stroke="${highlightColor}" stroke-width="1" opacity="0.5"/>
    </g>
</svg>`;
};

/**
 * Get vehicle SVG as data URL for use in map markers
 * Uses premium gradient colors for sophisticated appearance
 */
export const getVehicleSvgDataUrl = (
  vehicleType: string,
  status?: string | null,
  vehicleNumber?: string
): string => {
  const gradient = getStatusGradient(status);
  
  // Determine if it's a van or car
  const isVan = vehicleType?.toLowerCase().includes('van') || 
                vehicleType?.toLowerCase().includes('wheelchair');
  
  const svg = isVan 
    ? getVanSvg(gradient.primary, gradient.secondary, gradient.highlight, vehicleNumber)
    : getCarSvg(gradient.primary, gradient.secondary, gradient.highlight, vehicleNumber);
  
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
};

/**
 * Normalize driver status to standard format
 */
export type DriverStatus = 'AVAILABLE' | 'BUSY' | 'AWAY' | 'CLEARING' | 'OFFLINE';

export const normalizeDriverStatus = (status?: string | null): DriverStatus => {
  if (!status) return 'OFFLINE';
  
  const normalized = status.toUpperCase().trim();
  
  if (normalized.includes('AVAIL') || normalized.includes('FREE') || normalized === 'ONLINE') {
    return 'AVAILABLE';
  }
  if (normalized.includes('BUSY') || normalized.includes('ACTIVE') || normalized.includes('JOB')) {
    return 'BUSY';
  }
  if (normalized.includes('AWAY') || normalized.includes('BREAK') || normalized.includes('PAUSE')) {
    return 'AWAY';
  }
  if (normalized.includes('CLEAR') || normalized.includes('FINISH') || normalized.includes('PICK')) {
    return 'CLEARING';
  }
  
  return 'OFFLINE';
};

export type Variant = 'treatment' | 'control';

type Flags = Record<string, { enabled: boolean; rolloutPercent?: number }>;

// A failed fetch leaves every flag off, so visitors get the control experience
export async function loadFlags(): Promise<Flags> {
    try {
        const response = await fetch(import.meta.env.VITE_FLAGS_URL);
        return response.ok ? await response.json() : {};
    } catch {
        return {};
    }
}

// FNV-1a, so a visitor keeps their bucket without any server-side state
export function bucket(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % 100;
}

export function variantOf(flags: Flags, flag: string, userId: string): Variant {
    const value = flags[flag];
    const inRollout = value?.enabled && bucket(`${flag}:${userId}`) < (value.rolloutPercent ?? 100);
    return inRollout ? 'treatment' : 'control';
}

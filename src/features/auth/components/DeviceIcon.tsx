import { Smartphone, Laptop, Tablet } from "lucide-react";

interface DeviceIconProps {
    type: string;
    os?: string;
    className?: string;
}

export function DeviceIcon({ type, os = "", className = "h-5 w-5" }: DeviceIconProps) {
    const lowerType = type.toLowerCase();
    const lowerOs = os.toLowerCase();

    if (lowerType === "mobile" || lowerOs.includes("android") || lowerOs.includes("ios")) {
        return <Smartphone className={className} />;
    }

    if (lowerType === "tablet" || lowerOs.includes("ipad")) {
        return <Tablet className={className} />;
    }

    return <Laptop className={className} />;
}

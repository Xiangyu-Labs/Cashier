"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const t = useTranslations("Settings");
    const { theme, setTheme } = useTheme();
    // Ensure component is mounted to avoid hydration mismatch
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        // Render a placeholder with the same size to prevent layout shift
        return <Button variant="ghost" size="icon" className="w-9 px-0" />;
    }

    const toggleTheme = () => {
        if (theme === "system") {
            setTheme("light");
        } else if (theme === "light") {
            setTheme("dark");
        } else {
            setTheme("system");
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-9 px-0"
            title={t("themeToggle")}
        >
            {theme === "system" && <Monitor className="h-[1.2rem] w-[1.2rem]" />}
            {theme === "light" && <Sun className="h-[1.2rem] w-[1.2rem]" />}
            {theme === "dark" && <Moon className="h-[1.2rem] w-[1.2rem]" />}
            <span className="sr-only">{t("srThemeToggle")}</span>
        </Button>
    );
}

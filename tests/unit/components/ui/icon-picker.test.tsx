import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconPicker, type IconPickerProps } from "@/components/ui/icon-picker";
import { COMMON_LUCIDE_ICONS, type CommonLucideIcon } from "@/config/icons";

const iconNames = Object.fromEntries(
  COMMON_LUCIDE_ICONS.map((iconName) => [iconName, `Localized ${iconName}`])
) as Record<CommonLucideIcon, string>;

const messages: IconPickerProps["messages"] = {
  select: "Select localized icon",
  selected: (name) => `Selected localized icon: ${name}`,
  list: "Localized icons",
  iconNames,
};

describe("IconPicker", () => {
  it("uses localized accessible names for the trigger, list, and options", () => {
    const onChange = vi.fn();
    render(<IconPicker value="Coffee" onChange={onChange} messages={messages} />);

    const trigger = screen.getByRole("combobox", {
      name: "Selected localized icon: Localized Coffee",
    });
    fireEvent.click(trigger);

    expect(screen.getByRole("listbox", { name: "Localized icons" })).toBeInTheDocument();
    const option = screen.getByRole("option", { name: "Localized Coffee" });
    expect(option).toHaveAttribute("title", "Localized Coffee");
    expect(option).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: "Localized Bus" }));
    expect(onChange).toHaveBeenCalledWith("Bus");
  });

  it("keeps historical icon values readable", () => {
    render(<IconPicker value="LegacySpark" onChange={vi.fn()} messages={messages} />);

    expect(
      screen.getByRole("combobox", {
        name: "Selected localized icon: LegacySpark",
      })
    ).toBeInTheDocument();
  });

  it("announces the unselected trigger", () => {
    render(<IconPicker value={null} onChange={vi.fn()} messages={messages} />);

    expect(
      screen.getByRole("combobox", {
        name: "Select localized icon",
      })
    ).toBeInTheDocument();
  });
});

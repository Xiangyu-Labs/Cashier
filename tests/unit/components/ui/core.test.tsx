import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { describe, it, expect, vi } from 'vitest';

describe('UI Core Components', () => {
  describe('Button', () => {
    it('renders default variant correctly', () => {
      render(<Button>Default Button</Button>);
      const button = screen.getByRole('button', { name: /default button/i });
      expect(button).toBeDefined();
      expect(button.className).toContain('bg-primary');
    });

    it('renders destructive variant correctly', () => {
      render(<Button variant="destructive">Destructive Button</Button>);
      const button = screen.getByRole('button', { name: /destructive button/i });
      expect(button).toBeDefined();
      expect(button.className).toContain('bg-danger');
    });

    it('renders outline variant correctly', () => {
      render(<Button variant="outline">Outline Button</Button>);
      const button = screen.getByRole('button', { name: /outline button/i });
      expect(button).toBeDefined();
      expect(button.className).toContain('border-border');
    });

    it('handles click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click Me</Button>);
      const button = screen.getByRole('button', { name: /click me/i });
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Badge', () => {
    it('renders default variant correctly', () => {
      render(<Badge>Default Badge</Badge>);
      const badge = screen.getByText('Default Badge');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('bg-surface2');
    });

    it('renders success variant correctly', () => {
      render(<Badge variant="success">Success Badge</Badge>);
      const badge = screen.getByText('Success Badge');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('bg-primary/20');
    });

    it('renders error variant correctly', () => {
      render(<Badge variant="error">Error Badge</Badge>);
      const badge = screen.getByText('Error Badge');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('bg-danger/20');
    });
  });

  describe('Card', () => {
    it('renders card with header, title, content, and footer', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Card Content</p>
          </CardContent>
          <CardFooter>
            <p>Card Footer</p>
          </CardFooter>
        </Card>
      );

      const title = screen.getByText('Card Title');
      const content = screen.getByText('Card Content');
      const footer = screen.getByText('Card Footer');

      expect(title).toBeDefined();
      expect(content).toBeDefined();
      expect(footer).toBeDefined();

      // Verify structure implicitly by checking if elements are rendered
      // We can also check specific classes if needed, but presence is the main requirement
      expect(title.closest('div')?.className).toContain('font-semibold');
    });
  });
});

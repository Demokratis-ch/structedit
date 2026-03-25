import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('renders Demokratis and StructEdit breadcrumb without a document name', () => {
    render(<Header />);
    expect(screen.getByText('Demokratis')).toBeInTheDocument();
    expect(screen.getByText(/StructEdit/)).toBeInTheDocument();
    expect(screen.queryByText('entwurf.docx')).not.toBeInTheDocument();
  });

  it('shows the document name in the breadcrumb when provided', () => {
    render(<Header documentName="entwurf.docx" />);
    expect(screen.getByText('entwurf.docx')).toBeInTheDocument();
  });
});

interface SourcePreviewProps {
  url: string;
}

export function SourcePreview({ url }: SourcePreviewProps) {
  return (
    <div className="max-w-5xl mx-auto w-full h-full">
      <iframe src={url} className="w-full h-full block bg-white p-8" title="Document Viewer" />
    </div>
  );
}

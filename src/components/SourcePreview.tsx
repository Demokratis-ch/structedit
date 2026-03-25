interface SourcePreviewProps {
  url: string;
}

export function SourcePreview({ url }: SourcePreviewProps) {
  return (
    <div className="flex-1 border-r border-gray-200 bg-gray-100 flex flex-col min-w-0 w-1/2">
      <iframe src={url} className="w-full h-full block bg-white" title="Document Viewer" />
    </div>
  );
}

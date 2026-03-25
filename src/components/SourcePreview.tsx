interface SourcePreviewProps {
  url: string;
}

export function SourcePreview({ url }: SourcePreviewProps) {
  return (
    <div className="flex-1 border-r border-gray-200 bg-gray-100 flex flex-col min-w-0 w-1/2">
      <div className="max-w-5xl mx-auto w-full h-full">
        <iframe src={url} className="w-full h-full block bg-white p-8" title="Document Viewer" />
      </div>
    </div>
  );
}

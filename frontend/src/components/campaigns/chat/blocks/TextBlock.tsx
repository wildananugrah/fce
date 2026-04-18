import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function TextBlock({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none min-w-0 text-[12.5px] leading-[1.55] text-inherit break-words
        prose-p:my-1.5 prose-p:break-words prose-p:text-inherit
        prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:leading-[1.5] prose-li:text-inherit
        prose-headings:font-semibold prose-headings:text-[13px] prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-inherit
        prose-strong:font-semibold prose-strong:text-inherit
        prose-a:break-all prose-a:text-inherit prose-a:underline
        prose-table:text-[11px] prose-th:px-2 prose-td:px-2
        prose-code:text-[11px] prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:px-1 prose-code:py-[1px] prose-code:rounded prose-code:before:content-none prose-code:after:content-none
        prose-pre:my-2 prose-pre:p-2 prose-pre:bg-gray-50 prose-pre:text-gray-800 prose-pre:text-[11px] prose-pre:leading-[1.45] prose-pre:rounded prose-pre:border prose-pre:border-gray-200 prose-pre:overflow-x-auto prose-pre:whitespace-pre"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

import { Children, cloneElement, isValidElement, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_PAGE_SIZE = 10;

function withMobileColumnLabels(renderedRow, columns) {
  const cells = renderedRow?.props?.children ?? renderedRow;

  return Children.map(cells, (cell, index) => {
    if (!isValidElement(cell)) return cell;

    return cloneElement(
      cell,
      {},
      <span className="mb-1 block font-sans text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400 md:hidden" aria-hidden="true">
        {columns[index]?.label}
      </span>,
      cell.props.children,
    );
  });
}

export default function Table({
  ariaLabel,
  className = "",
  columns = [],
  data = [],
  emptyDescription = "Records will appear here when they are available.",
  emptyTestId,
  emptyTitle = "No records found",
  getRowKey = (row, index) => row?.id ?? index,
  header,
  pageSize = DEFAULT_PAGE_SIZE,
  renderRow,
  rowClassName = "grid grid-cols-2 gap-4 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0",
  tableClassName = "block w-full text-left text-sm md:table",
  testId,
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = data.slice(startIndex, startIndex + pageSize);
  const endIndex = Math.min(startIndex + pageRows.length, data.length);

  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card ${className}`}>
      {header}

      {data.length === 0 ? (
        <div className="px-5 py-12 text-center" data-testid={emptyTestId}>
          <p className="font-bold text-navy-900">{emptyTitle}</p>
          <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
        </div>
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto">
            <table aria-label={ariaLabel} className={tableClassName} data-testid={testId}>
              <thead className="hidden bg-slate-50 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 md:table-header-group">
                <tr>
                  {columns.map((column) => (
                    <th className={`px-4 py-3 ${column.className ?? ""}`} key={column.key ?? column.label} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block divide-y divide-slate-100 md:table-row-group">
                {pageRows.map((row, index) => (
                  <tr className={typeof rowClassName === "function" ? rowClassName(row) : rowClassName} key={getRowKey(row, startIndex + index)}>
                    {withMobileColumnLabels(renderRow(row, startIndex + index), columns)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-xs font-semibold text-slate-500 sm:text-left">
              Showing <span className="font-mono tabular-nums text-slate-700">{startIndex + 1}–{endIndex}</span> of <span className="font-mono tabular-nums text-slate-700">{data.length}</span>
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                aria-label="Previous page"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition-colors hover:border-water-300 hover:bg-water-50 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-slate-100"
                disabled={currentPage === 1}
                onClick={() => setRequestedPage(currentPage - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <span className="min-w-24 text-center text-xs font-bold text-slate-600">
                Page <span className="font-mono tabular-nums">{currentPage}</span> of <span className="font-mono tabular-nums">{totalPages}</span>
              </span>
              <button
                aria-label="Next page"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition-colors hover:border-water-300 hover:bg-water-50 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-slate-100"
                disabled={currentPage === totalPages}
                onClick={() => setRequestedPage(currentPage + 1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

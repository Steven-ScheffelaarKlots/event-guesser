import { GENRES } from "@chronodle/shared";
import type { Filters, GenreFilter, StatusFilter } from "../logic/events";

interface ToolbarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function Toolbar({ filters, onChange }: ToolbarProps) {
  return (
    <div className="toolbar">
      <input
        type="search"
        className="input toolbar__search"
        placeholder="Search name, description or id"
        aria-label="Search events"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
      <select
        className="input"
        aria-label="Filter by genre"
        value={filters.genre}
        onChange={(e) => onChange({ ...filters, genre: e.target.value as GenreFilter })}
      >
        <option value="all">All genres</option>
        {GENRES.map((genre) => (
          <option key={genre} value={genre}>
            {genre}
          </option>
        ))}
        <option value="untagged">Untagged</option>
      </select>
      <select
        className="input"
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })}
      >
        <option value="all">All statuses</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
}

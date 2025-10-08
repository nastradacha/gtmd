"use client";

import { useEffect, useState, useRef } from "react";

interface Collaborator {
  login: string;
  avatar_url: string;
  name: string;
}

interface UserSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function UserSelector({ value, onChange, placeholder = "Type GitHub username...", className = "" }: UserSelectorProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [filteredCollaborators, setFilteredCollaborators] = useState<Collaborator[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch collaborators on mount
  useEffect(() => {
    fetchCollaborators();
  }, []);

  // Filter collaborators based on input
  useEffect(() => {
    if (value.trim()) {
      const filtered = collaborators.filter(
        (collab) =>
          collab.login.toLowerCase().includes(value.toLowerCase()) ||
          collab.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredCollaborators(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setFilteredCollaborators(collaborators);
      setShowDropdown(false);
    }
  }, [value, collaborators]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchCollaborators() {
    try {
      setLoading(true);
      const res = await fetch("/api/github/collaborators");
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data);
      }
    } catch (err) {
      console.error("Failed to fetch collaborators:", err);
    } finally {
      setLoading(false);
    }
  }

  function selectCollaborator(login: string) {
    onChange(login);
    setShowDropdown(false);
    inputRef.current?.blur();
  }

  function handleFocus() {
    if (collaborators.length > 0) {
      setFilteredCollaborators(collaborators);
      setShowDropdown(true);
    }
  }

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      {showDropdown && filteredCollaborators.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {filteredCollaborators.map((collab) => (
            <button
              key={collab.login}
              type="button"
              onClick={() => selectCollaborator(collab.login)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left transition-colors"
            >
              <img
                src={collab.avatar_url}
                alt={collab.login}
                className="w-8 h-8 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">@{collab.login}</div>
                {collab.name !== collab.login && (
                  <div className="text-xs text-gray-500 truncate">{collab.name}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
}

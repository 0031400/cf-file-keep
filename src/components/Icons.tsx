import type { ReactNode } from 'react';

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function PlusIcon() {
	return (
		<Svg>
			<path d="M12 5v14M5 12h14" />
		</Svg>
	);
}

export function PencilIcon() {
	return (
		<Svg>
			<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
			<path d="M14.5 5.5 18.5 9.5" />
		</Svg>
	);
}

export function TrashIcon() {
	return (
		<Svg>
			<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
		</Svg>
	);
}

export function DownloadIcon() {
	return (
		<Svg>
			<path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
		</Svg>
	);
}

export function EyeIcon() {
	return (
		<Svg>
			<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
			<circle cx="12" cy="12" r="2.6" />
		</Svg>
	);
}

export function UploadIcon() {
	return (
		<Svg>
			<path d="M12 19V8M8 12l4-4 4 4M5 4h14" />
		</Svg>
	);
}

export function LogOutIcon() {
	return (
		<Svg>
			<path d="M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9" />
		</Svg>
	);
}

export function FolderIcon() {
	return (
		<Svg>
			<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18V7.5Z" />
		</Svg>
	);
}

export function CloseIcon() {
	return (
		<Svg>
			<path d="M6 6l12 12M18 6L6 18" />
		</Svg>
	);
}

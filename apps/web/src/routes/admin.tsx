import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin")({
	component: AdminLayout,
});

function AdminLayout() {
	const { isValid, isLoading, login, logout } = useAdminAuth();

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!isValid) {
		return <LoginForm onLogin={login} />;
	}

	return (
		<div className="min-h-screen">
			<nav className="border-b">
				<div className="container mx-auto flex items-center justify-between px-4 py-3">
					<div className="flex items-center gap-6">
						<Link to="/admin" className="font-semibold">
							Admin
						</Link>
						<div className="flex gap-4">
							<Link
								to="/admin/vouchers"
								className="text-muted-foreground hover:text-foreground text-sm"
								activeProps={{ className: "text-foreground" }}
							>
								Vouchers
							</Link>
							<Link
								to="/admin/users"
								className="text-muted-foreground hover:text-foreground text-sm"
								activeProps={{ className: "text-foreground" }}
							>
								Users
							</Link>
						</div>
					</div>
					<Button variant="ghost" size="sm" onClick={logout}>
						<LogOut className="mr-2 h-4 w-4" />
						Logout
					</Button>
				</div>
			</nav>
			<main className="container mx-auto px-4 py-6">
				<Outlet />
			</main>
		</div>
	);
}

function LoginForm({ onLogin }: { onLogin: (password: string) => Promise<unknown> }) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setIsSubmitting(true);

		try {
			await onLogin(password);
		} catch (e) {
		  console.log(e)
			setError("Invalid password");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="w-full max-w-sm space-y-4">
				<h1 className="text-center text-2xl font-semibold">Admin Login</h1>
				<form onSubmit={handleSubmit} className="space-y-4">
					<Input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={isSubmitting}
					/>
					<Button type="submit" className="w-full" disabled={isSubmitting}>
						{isSubmitting ? "Logging in..." : "Login"}
					</Button>
					{error && <p className="text-center text-sm text-red-500">{error}</p>}
				</form>
			</div>
		</div>
	);
}

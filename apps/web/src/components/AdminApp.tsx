import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useConvex } from "convex/react";
import { useState } from "react";

interface AdminAppProps {
	children: React.ReactNode;
}

export function AdminApp({ children }: AdminAppProps) {
	const { isValid, isLoading, login } = useAdminAuth();
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setIsSubmitting(true);

		try {
			await login(password);
			setPassword("");
		} catch (e) {
			console.log(e);
			setError("Invalid password");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!isValid) {
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
						{error && (
							<p className="text-center text-sm text-red-500">{error}</p>
						)}
					</form>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}

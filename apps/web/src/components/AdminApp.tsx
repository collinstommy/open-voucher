import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

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
			<div className="admin-shell">
				<div className="gate">
					<p className="muted">Loading...</p>
				</div>
			</div>
		);
	}

	if (!isValid) {
		return (
			<div className="admin-shell">
				<div className="gate">
					<div className="gate-card">
						<h1>Admin login</h1>
						<form onSubmit={handleSubmit}>
							<input
								className="input"
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								disabled={isSubmitting}
							/>
							<button
								type="submit"
								className="btn btn-gold"
								disabled={isSubmitting}
							>
								{isSubmitting ? "Logging in..." : "Log in"}
							</button>
							{error && <p className="warn">{error}</p>}
						</form>
					</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}

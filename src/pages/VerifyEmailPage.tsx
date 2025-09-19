import { Navigate } from "react-router-dom";

// Verification page removed - redirect to dashboard
const VerifyEmailPage = () => {
  return <Navigate to="/dashboard" replace />;
};

export default VerifyEmailPage;

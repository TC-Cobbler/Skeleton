import { createBrowserRouter } from "react-router";
import HomePage from "./pages/HomePage";
import StatsPage from "./pages/StatsPage";

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/stats", element: <StatsPage /> },
]);

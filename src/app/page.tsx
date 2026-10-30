"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { ControlRoomDashboard } from "@/components/dashboard/ControlRoomDashboard";
import { DepartmentDashboard } from "@/components/dashboard/DepartmentDashboard";
import { CitizenPortal } from "@/components/citizen/CitizenPortal";
import { Department } from "@/types";
import { useRouter } from "next/navigation";

export default function Home() {
  const { currentProfile, status, error, retryProfile, signOut } = useAuth();
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (status === "recovery") router.replace("/reset-password");
  }, [status, router]);

  useEffect(() => {
    if (status !== "ready") return;
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.departments) {
          setDepartments(data.departments);
        }
      })
      .catch((err) => console.error("Failed to load departments", err));
  }, [status]);

  if (["profile_missing", "profile_error"].includes(status))
    return (
      <section className="mx-auto max-w-lg space-y-4 rounded-xl border border-red-200 p-6">
        <h1 className="text-xl font-semibold">Account access unavailable</h1>
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
        <button
          onClick={() => void retryProfile()}
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Retry profile
        </button>
        <button
          onClick={() => void signOut().catch(() => window.location.reload())}
          className="ml-3 rounded border border-slate-200 px-4 py-2"
        >
          Sign out
        </button>
      </section>
    );
  if (status !== "ready" || !currentProfile)
    return (
      <p role="status" className="py-12 text-center text-slate-500">
        {status === "loading_profile"
          ? "Loading your account profile…"
          : "Restoring your session…"}
      </p>
    );

  // Direct rendering based on the verified account profile
  switch (currentProfile.role) {
    case "fire_rescue":
    case "electricity":
    case "municipal":
    case "medical":
    case "relief_responder":
      return (
        <DepartmentDashboard
          key={currentProfile.id}
          currentUser={currentProfile}
          departmentCode={currentProfile.department!.code}
          departmentName={currentProfile.department!.name}
          departments={departments}
        />
      );

    case "citizen":
      return <CitizenPortal currentUser={currentProfile} />;

    case "admin":
      return (
        <ControlRoomDashboard
          currentUser={currentProfile}
          departments={departments}
        />
      );
    default:
      return <p role="alert">This account role is not supported.</p>;
  }
}

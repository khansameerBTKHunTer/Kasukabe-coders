'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { ControlRoomDashboard } from '@/components/dashboard/ControlRoomDashboard';
import { DepartmentDashboard } from '@/components/dashboard/DepartmentDashboard';
import { CitizenPortal } from '@/components/citizen/CitizenPortal';
import { Department } from '@/types';
import { SEED_DEPARTMENTS } from '@/lib/data-store';

export default function Home() {
  const { currentProfile } = useAuth();
  const [departments, setDepartments] = useState<Department[]>(SEED_DEPARTMENTS);

  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.departments) {
          setDepartments(data.departments);
        }
      })
      .catch((err) => console.error('Failed to load departments', err));
  }, []);

  // Direct rendering based on current user role
  switch (currentProfile.role) {
    case 'fire_rescue':
      return (
        <DepartmentDashboard
          key={currentProfile.id}
          currentUser={currentProfile}
          departmentCode="FIRE_RESCUE"
          departmentName="Fire & Rescue Operations"
          departments={departments}
        />
      );

    case 'electricity':
      return (
        <DepartmentDashboard
          key={currentProfile.id}
          currentUser={currentProfile}
          departmentCode="ELECTRICITY"
          departmentName="Electricity Department (Power Grid Control)"
          departments={departments}
        />
      );

    case 'municipal':
    case 'medical':
      return (
        <DepartmentDashboard
          key={currentProfile.id}
          currentUser={currentProfile}
          departmentCode={currentProfile.role === 'municipal' ? 'MUNICIPAL' : 'MEDICAL'}
          departmentName={currentProfile.role === 'municipal' ? 'Municipal / Road Services' : 'Medical Response'}
          departments={departments}
        />
      );

    case 'citizen':
      return <CitizenPortal currentUser={currentProfile} />;

    case 'admin':
    default:
      return (
        <ControlRoomDashboard
          currentUser={currentProfile}
          departments={departments}
        />
      );
  }
}

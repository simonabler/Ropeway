import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'projects',
    pathMatch: 'full'
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/project/project-list/project-list').then(m => m.ProjectList)
  },
  {
    path: 'project/create',
    loadComponent: () =>
      import('./features/project/project-create/project-create').then(m => m.ProjectCreate)
  },
  {
    path: 'project/:id',
    loadComponent: () =>
      import('./features/project/project-detail/project-detail').then(m => m.ProjectDetail)
  },
  {
    path: '**',
    redirectTo: 'projects'
  }
];

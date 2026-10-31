import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CollectionsPanel } from '../../features/collections/collections-panel';
import { HistoryPanel } from '../../features/history/history-panel';
import { WorkspaceSwitcher } from '../workspace-switcher/workspace-switcher';

/** Contenido del panel lateral: colecciones e historial. Lo comparten los tres layouts del shell. */
@Component({
  selector: 'app-sidebar',
  imports: [CollectionsPanel, HistoryPanel, WorkspaceSwitcher],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {}

import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ConfirmationService, MenuItem, PrimeTemplate } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Menu } from 'primeng/menu';
import {
  Tree,
  TreeNodeCollapseEvent,
  TreeNodeExpandEvent,
  TreeNodeSelectEvent,
} from 'primeng/tree';
import { CollectionsStore } from '../../core/state/collections.store';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { NameDialog } from '../../shared/components/name-dialog/name-dialog';
import {
  NewRequestChoice,
  RequestDialog,
} from '../../shared/components/request-dialog/request-dialog';
import { Observable } from 'rxjs';
import { ExplorerNode, NodeData, buildNodes, findNode, nodeKey } from './tree-nodes';

interface NameAction {
  title: string;
  label: string;
  confirmLabel: string;
  value: string;
  run: (name: string) => Observable<void>;
}

interface RequestTarget {
  collectionId: string;
  folderId?: string;
}

/** Árbol de colecciones, carpetas y peticiones del workspace activo, con sus acciones. */
@Component({
  selector: 'app-collections-panel',
  imports: [Tree, PrimeTemplate, Menu, Button, ConfirmDialog, NameDialog, RequestDialog],
  providers: [ConfirmationService],
  templateUrl: './collections-panel.html',
  styleUrl: './collections-panel.scss',
  // Los estilos retocan los elementos internos de PrimeNG (p-tree, p-menu).
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsPanel {
  protected readonly store = inject(CollectionsStore);
  protected readonly workspaces = inject(WorkspaceStore);
  private readonly confirmation = inject(ConfirmationService);

  private readonly menu = viewChild.required(Menu);

  /** Claves de los nodos que el usuario plegó; el resto aparece desplegado. */
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  protected readonly nodes = computed(() => buildNodes(this.store.trees(), this.collapsed()));
  protected readonly selectedNode = computed(() => {
    const id = this.store.selectedRequestId();
    return id ? findNode(this.nodes(), nodeKey('request', id)) : null;
  });

  protected readonly menuItems = signal<MenuItem[]>([]);

  protected readonly nameAction = signal<NameAction | null>(null);
  protected readonly nameVisible = signal(false);
  protected readonly requestTarget = signal<RequestTarget | null>(null);
  protected readonly requestVisible = signal(false);
  protected readonly saving = signal(false);

  // --- Árbol ---
  protected select(event: TreeNodeSelectEvent): void {
    const data = event.node.data as NodeData | undefined;
    if (data?.kind === 'request') this.store.selectRequest(data.id);
  }

  protected setExpanded(
    event: TreeNodeExpandEvent | TreeNodeCollapseEvent,
    expanded: boolean,
  ): void {
    const key = event.node.key;
    if (!key) return;
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (expanded) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected openMenu(event: Event, node: ExplorerNode): void {
    event.stopPropagation();
    const items = this.menuItemsFor(node);
    this.menuItems.set(items);
    // El menú es OnPush y se abre en este mismo evento: se le entrega el modelo ya, sin esperar al binding.
    const menu = this.menu();
    menu.model = items;
    menu.toggle(event);
  }

  // --- Acciones de alta ---
  protected newCollection(): void {
    this.askName({
      title: 'Nueva colección',
      label: 'Nombre de la colección',
      confirmLabel: 'Crear',
      value: '',
      run: (name) => this.store.createCollection(name),
    });
  }

  private newFolder(collectionId: string, parentId?: string): void {
    this.askName({
      title: parentId ? 'Nueva subcarpeta' : 'Nueva carpeta',
      label: 'Nombre de la carpeta',
      confirmLabel: 'Crear',
      value: '',
      run: (name) => this.store.createFolder({ name, collectionId, parentId }),
    });
  }

  private newRequest(collectionId: string, folderId?: string): void {
    this.requestTarget.set({ collectionId, folderId });
    this.requestVisible.set(true);
  }

  protected createRequest(choice: NewRequestChoice): void {
    const target = this.requestTarget();
    if (!target) return;
    this.saving.set(true);
    this.store
      .createRequest({
        name: choice.name,
        protocol: choice.protocol,
        method: choice.method,
        url: '',
        collectionId: target.collectionId,
        folderId: target.folderId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.requestVisible.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  // --- Renombrar y borrar ---
  private rename(node: ExplorerNode, data: NodeData): void {
    const what = { collection: 'colección', folder: 'carpeta', request: 'petición' }[data.kind];
    this.askName({
      title: `Renombrar ${what}`,
      label: 'Nombre',
      confirmLabel: 'Guardar',
      value: node.label ?? '',
      run: (name) => {
        switch (data.kind) {
          case 'collection':
            return this.store.renameCollection(data.id, name);
          case 'folder':
            return this.store.renameFolder(data.collectionId, data.id, name);
          case 'request':
            return this.store.renameRequest(data.collectionId, data.id, name);
        }
      },
    });
  }

  private remove(node: ExplorerNode, data: NodeData): void {
    const name = node.label ?? '';
    const messages = {
      collection: `Se eliminará la colección «${name}» con todas sus carpetas y peticiones.`,
      folder: `Se eliminará la carpeta «${name}» con sus subcarpetas y peticiones.`,
      request: `Se eliminará la petición «${name}».`,
    };
    this.confirmation.confirm({
      header: 'Confirmar eliminación',
      message: `${messages[data.kind]} Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: () => {
        const done$ = {
          collection: () => this.store.deleteCollection(data.id),
          folder: () => this.store.deleteFolder(data.collectionId, data.id),
          request: () => this.store.deleteRequest(data.collectionId, data.id),
        }[data.kind]();
        done$.subscribe();
      },
    });
  }

  // --- Diálogo de nombre ---
  private askName(action: NameAction): void {
    this.nameAction.set(action);
    this.nameVisible.set(true);
  }

  protected confirmName(name: string): void {
    const action = this.nameAction();
    if (!action) return;
    this.saving.set(true);
    action.run(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.nameVisible.set(false);
      },
      error: () => this.saving.set(false), // el interceptor ya avisó; el diálogo sigue abierto
    });
  }

  private menuItemsFor(node: ExplorerNode): MenuItem[] {
    const data = node.data as NodeData;
    const danger = { label: 'Eliminar', icon: 'pi pi-trash', styleClass: 'menu-danger' };
    const rename = {
      label: 'Renombrar',
      icon: 'pi pi-pencil',
      command: () => this.rename(node, data),
    };
    const remove = { ...danger, command: () => this.remove(node, data) };

    if (data.kind === 'request') return [rename, { separator: true }, remove];

    const parentId = data.kind === 'folder' ? data.id : undefined;
    return [
      {
        label: parentId ? 'Nueva subcarpeta' : 'Nueva carpeta',
        icon: 'pi pi-folder-plus',
        command: () => this.newFolder(data.collectionId, parentId),
      },
      {
        label: 'Nueva petición',
        icon: 'pi pi-plus',
        command: () => this.newRequest(data.collectionId, parentId),
      },
      { separator: true },
      rename,
      { separator: true },
      remove,
    ];
  }
}

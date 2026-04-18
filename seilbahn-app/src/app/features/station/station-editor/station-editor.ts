import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { EndStation } from '../../../models';
import { ProjectStateService } from '../../../services/state/project-state.service';

@Component({
  selector: 'app-station-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './station-editor.html',
  styleUrl: './station-editor.scss',
  standalone: true
})
export class StationEditor {
  private _project;

  constructor(private projectStateService: ProjectStateService) {
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
  }

  get project() {
    return this._project();
  }

  get startStation(): EndStation | null {
    return this.project?.startStation ?? null;
  }

  get endStation(): EndStation | null {
    return this.project?.endStation ?? null;
  }

  updateStationField(
    type: 'start' | 'end',
    field: keyof EndStation,
    value: string | number | undefined
  ): void {
    this.projectStateService.updateStation(type, { [field]: value } as Partial<EndStation>);
  }

  updateAnchorHeight(type: 'start' | 'end', heightAboveTerrain: number): void {
    const station = type === 'start' ? this.startStation : this.endStation;
    if (!station) return;

    this.projectStateService.updateStation(type, {
      anchorPoint: {
        ...station.anchorPoint,
        heightAboveTerrain
      }
    });
  }

  updateDerivationMode(type: 'start' | 'end', mode: 'auto' | 'manual'): void {
    this.projectStateService.updateStation(type, { derivationMode: mode });
    this.projectStateService.synchronizeStationsFromTerrain();
  }

  stationTitle(type: 'start' | 'end'): string {
    return type === 'start' ? 'Startstation' : 'Endstation';
  }

  getStationValidationMessages(station: EndStation): string[] {
    const messages: string[] = [];

    if (station.anchorPoint.heightAboveTerrain < 0) {
      messages.push('Die Ankerhoehe ueber dem Gelaende muss null oder positiv sein.');
    }

    if (station.groundClearance <= 0) {
      messages.push('Der lokale Freiraum sollte groesser als null sein.');
    }

    if ((station.derivationMode ?? 'auto') === 'manual' && station.stationLength < 0) {
      messages.push('Die manuelle Stationslaenge muss null oder positiv sein.');
    }

    return messages;
  }
}

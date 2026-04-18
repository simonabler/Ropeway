import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectStateService } from '../../../services/state/project-state.service';
import {
  deriveEdgeSupportTraversability,
  getTraversableBoundaryStation
} from '../../../services/operations/operational-envelope';

@Component({
  selector: 'app-operational-envelope-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './operational-envelope-editor.html',
  styleUrl: './operational-envelope-editor.scss',
  standalone: true
})
export class OperationalEnvelopeEditor {
  private _project;
  private _supports;

  constructor(private projectStateService: ProjectStateService) {
    this._project = toSignal(this.projectStateService.project$, { initialValue: null });
    this._supports = toSignal(this.projectStateService.supports$, { initialValue: [] });
  }

  get project() {
    return this._project();
  }

  get supports() {
    return this._supports();
  }

  get monitoredRangeStart(): number {
    return this.project?.operationalEnvelope.activeMonitoredRangeStartStation ?? 0;
  }

  get monitoredRangeEnd(): number {
    return this.project?.operationalEnvelope.activeMonitoredRangeEndStation ?? 0;
  }

  get derivedTraversability() {
    if (!this.project) {
      return {
        firstSupportTraversable: false,
        lastSupportTraversable: false
      };
    }

    return deriveEdgeSupportTraversability(
      this.project.operationalEnvelope,
      this.supports,
      this.project.startStation.stationLength,
      this.project.endStation.stationLength
    );
  }

  updateRangeStart(value: number): void {
    this.projectStateService.updateOperationalEnvelope({
      activeMonitoredRangeStartStation: value
    });
  }

  updateRangeEnd(value: number): void {
    this.projectStateService.updateOperationalEnvelope({
      activeMonitoredRangeEndStation: value
    });
  }

  setFirstSupportTraversable(enabled: boolean): void {
    const project = this.project;
    if (!project) return;

    this.projectStateService.updateOperationalEnvelope({
      activeMonitoredRangeStartStation: enabled
        ? getTraversableBoundaryStation(
            this.supports,
            'start',
            project.startStation.stationLength
          )
        : project.startStation.stationLength
    });
  }

  setLastSupportTraversable(enabled: boolean): void {
    const project = this.project;
    if (!project) return;

    this.projectStateService.updateOperationalEnvelope({
      activeMonitoredRangeEndStation: enabled
        ? getTraversableBoundaryStation(
            this.supports,
            'end',
            project.endStation.stationLength
          )
        : project.endStation.stationLength
    });
  }

  get validationMessages(): string[] {
    const project = this.project;
    if (!project) return [];

    const messages: string[] = [];
    if (this.monitoredRangeStart > this.monitoredRangeEnd) {
      messages.push('Der Start des überwachten Bereichs muss vor dem Ende liegen.');
    }

    if (this.monitoredRangeStart < project.startStation.stationLength) {
      messages.push('Der überwachte Bereich kann nicht vor der Startstation beginnen.');
    }

    if (this.monitoredRangeEnd > project.endStation.stationLength) {
      messages.push('Der überwachte Bereich kann nicht hinter der Endstation enden.');
    }

    return messages;
  }
}
